import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  VendorLedgerEntry,
  VendorLedgerStatus,
  VendorLedgerType,
} from './entities/vendor-ledger-entry.entity';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { ListLedgerQueryDto } from './dto/list-ledger.query.dto';
import { AdminPayoutDto } from './dto/admin-payout.dto';

export interface WalletSummary {
  totalEarnings: number;
  pendingSettlement: number;
  paidOut: number;
  commissionDeducted: number;
}

export interface LedgerEntryResponse {
  id: number;
  vendorUserId: number;
  vendorLeadId: number | null;
  type: string;
  amount: number;
  status: string;
  description: string | null;
  createdAt: Date;
}

@Injectable()
export class VendorWalletService {
  constructor(
    @InjectRepository(VendorLedgerEntry)
    private readonly ledgerRepo: Repository<VendorLedgerEntry>,
    private readonly settingsService: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  async getCommissionPercent(): Promise<number> {
    const settings = await this.settingsService.getSettings();
    const pct = Number(settings.vendorCommissionPercent);
    return Number.isFinite(pct) && pct >= 0 ? pct : 10;
  }

  async recordJobCompletion(
    vendorUserId: number,
    vendorLeadId: number,
    jobAmount: number,
    commissionPercent: number,
  ): Promise<void> {
    const existing = await this.ledgerRepo.findOne({
      where: { vendorLeadId, type: VendorLedgerType.EARNING },
    });
    if (existing) return;

    const amount = Number(jobAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('jobAmount must be a positive number');
    }
    const pct = Number(commissionPercent);
    const commission = Math.round((amount * pct) / 100 * 100) / 100;
    const net = Math.round((amount - commission) * 100) / 100;

    await this.ledgerRepo.save(
      this.ledgerRepo.create({
        vendorUserId,
        vendorLeadId,
        type: VendorLedgerType.EARNING,
        amount: net,
        status: VendorLedgerStatus.PENDING,
        description: `Job earning (lead #${vendorLeadId})`,
      }),
    );
    await this.ledgerRepo.save(
      this.ledgerRepo.create({
        vendorUserId,
        vendorLeadId,
        type: VendorLedgerType.COMMISSION,
        amount: commission,
        status: VendorLedgerStatus.SETTLED,
        description: `FMP commission ${pct}% (lead #${vendorLeadId})`,
      }),
    );
  }

  async getSummary(vendorUserId: number): Promise<WalletSummary> {
    const entries = await this.ledgerRepo.find({ where: { vendorUserId } });
    let totalEarnings = 0;
    let pendingSettlement = 0;
    let paidOut = 0;
    let commissionDeducted = 0;

    for (const e of entries) {
      const amt = Number(e.amount);
      if (e.type === VendorLedgerType.EARNING) {
        totalEarnings += amt;
        if (e.status === VendorLedgerStatus.PENDING) {
          pendingSettlement += amt;
        }
      }
      if (e.type === VendorLedgerType.COMMISSION) {
        commissionDeducted += amt;
      }
      if (e.type === VendorLedgerType.PAYOUT) {
        paidOut += amt;
      }
    }

    return {
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      pendingSettlement: Math.round(pendingSettlement * 100) / 100,
      paidOut: Math.round(paidOut * 100) / 100,
      commissionDeducted: Math.round(commissionDeducted * 100) / 100,
    };
  }

  async listEntries(
    vendorUserId: number,
    query: ListLedgerQueryDto,
  ): Promise<{
    items: LedgerEntryResponse[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const [rows, total] = await this.ledgerRepo.findAndCount({
      where: { vendorUserId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: rows.map((r) => this.mapEntry(r)),
      total,
      page,
      limit,
    };
  }

  async adminRecordPayout(dto: AdminPayoutDto): Promise<LedgerEntryResponse> {
    const entry = this.ledgerRepo.create({
      vendorUserId: dto.vendorUserId,
      vendorLeadId: null,
      type: VendorLedgerType.PAYOUT,
      amount: dto.amount,
      status: VendorLedgerStatus.SETTLED,
      description: dto.description ?? 'Admin payout',
    });
    const saved = await this.ledgerRepo.save(entry);

    const pending = await this.ledgerRepo.find({
      where: {
        vendorUserId: dto.vendorUserId,
        type: VendorLedgerType.EARNING,
        status: VendorLedgerStatus.PENDING,
      },
      order: { createdAt: 'ASC' },
    });
    let remaining = dto.amount;
    for (const row of pending) {
      if (remaining <= 0) break;
      const rowAmt = Number(row.amount);
      if (rowAmt <= remaining) {
        row.status = VendorLedgerStatus.SETTLED;
        await this.ledgerRepo.save(row);
        remaining -= rowAmt;
      }
    }

    await this.notifications.create({
      userId: dto.vendorUserId,
      type: NotificationType.VENDOR_PAYOUT,
      title: 'Payout recorded',
      body: `₹${dto.amount} has been recorded against your account.`,
      metadata: { payoutEntryId: saved.id },
    });

    return this.mapEntry(saved);
  }

  private mapEntry(e: VendorLedgerEntry): LedgerEntryResponse {
    return {
      id: e.id,
      vendorUserId: e.vendorUserId,
      vendorLeadId: e.vendorLeadId,
      type: e.type,
      amount: Number(e.amount),
      status: e.status,
      description: e.description,
      createdAt: e.createdAt,
    };
  }
}
