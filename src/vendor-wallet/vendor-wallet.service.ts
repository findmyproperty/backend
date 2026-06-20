import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import {
  VendorLedgerEntry,
  VendorLedgerStatus,
  VendorLedgerType,
} from './entities/vendor-ledger-entry.entity';
import {
  VendorPayoutAccount,
  VendorPayoutAccountType,
} from './entities/vendor-payout-account.entity';
import {
  VendorWithdrawal,
  VendorWithdrawalMode,
  VendorWithdrawalStatus,
} from './entities/vendor-withdrawal.entity';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { ListLedgerQueryDto } from './dto/list-ledger.query.dto';
import { AdminPayoutDto } from './dto/admin-payout.dto';
import { AdminCreatePayoutDto } from './dto/admin-create-payout.dto';
import { AdminCreditWalletDto } from './dto/admin-credit-wallet.dto';
import { CreatePayoutAccountDto } from './dto/create-payout-account.dto';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { ListWithdrawalsQueryDto } from './dto/list-withdrawals.query.dto';
import { UsersService } from '../users/users.service';
import {
  RazorpayFundAccount,
  RazorpayPayout,
  RazorpayService,
} from '../razorpay/razorpay.service';

export interface WalletSummary {
  totalEarnings: number;
  pendingSettlement: number;
  availableBalance: number;
  pendingPayouts: number;
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

export interface PayoutAccountResponse {
  id: number;
  vendorUserId: number;
  type: string;
  label: string | null;
  beneficiaryName: string;
  razorpayContactId: string;
  razorpayFundAccountId: string;
  ifsc: string | null;
  bankName: string | null;
  accountNumberLast4: string | null;
  vpaAddress: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WithdrawalResponse {
  id: number;
  vendorUserId: number;
  payoutAccountId: number;
  ledgerEntryId: number | null;
  amount: number;
  amountPaise: number;
  currency: string;
  status: string;
  mode: string;
  purpose: string;
  referenceId: string;
  razorpayPayoutId: string | null;
  utr: string | null;
  failureReason: string | null;
  statusDetails: Record<string, unknown> | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class VendorWalletService {
  constructor(
    @InjectRepository(VendorLedgerEntry)
    private readonly ledgerRepo: Repository<VendorLedgerEntry>,
    @InjectRepository(VendorPayoutAccount)
    private readonly payoutAccountRepo: Repository<VendorPayoutAccount>,
    @InjectRepository(VendorWithdrawal)
    private readonly withdrawalRepo: Repository<VendorWithdrawal>,
    private readonly settingsService: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly usersService: UsersService,
    private readonly razorpayService: RazorpayService,
    private readonly configService: ConfigService,
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
    const commission = Math.round(((amount * pct) / 100) * 100) / 100;
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
    let pendingPayouts = 0;
    let paidOut = 0;
    let commissionDeducted = 0;

    for (const entry of entries) {
      const amount = Number(entry.amount);
      if (entry.type === VendorLedgerType.EARNING) {
        totalEarnings += amount;
      }
      if (entry.type === VendorLedgerType.COMMISSION) {
        commissionDeducted += amount;
      }
      if (
        entry.type === VendorLedgerType.PAYOUT &&
        entry.status === VendorLedgerStatus.PENDING
      ) {
        pendingPayouts += amount;
      }
      if (
        entry.type === VendorLedgerType.PAYOUT &&
        entry.status === VendorLedgerStatus.SETTLED
      ) {
        paidOut += amount;
      }
    }

    const availableBalance = Math.max(
      0,
      totalEarnings - paidOut - pendingPayouts,
    );

    return {
      totalEarnings: this.roundMoney(totalEarnings),
      pendingSettlement: this.roundMoney(availableBalance),
      availableBalance: this.roundMoney(availableBalance),
      pendingPayouts: this.roundMoney(pendingPayouts),
      paidOut: this.roundMoney(paidOut),
      commissionDeducted: this.roundMoney(commissionDeducted),
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
      items: rows.map((row) => this.mapEntry(row)),
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

    await this.settlePendingEarnings(dto.vendorUserId, dto.amount);

    await this.notifications.create({
      userId: dto.vendorUserId,
      type: NotificationType.VENDOR_PAYOUT,
      title: 'Payout recorded',
      body: `₹${dto.amount} has been recorded against your account.`,
      metadata: { payoutEntryId: saved.id },
    });

    return this.mapEntry(saved);
  }

  async adminCreatePayout(
    dto: AdminCreatePayoutDto,
  ): Promise<WithdrawalResponse> {
    return this.createWithdrawal(dto.vendorUserId, {
      payoutAccountId: dto.payoutAccountId,
      amount: dto.amount,
      mode: dto.mode,
      description: dto.description?.trim() || 'Admin RazorpayX vendor payout',
    });
  }

  async adminCreditWallet(
    dto: AdminCreditWalletDto,
  ): Promise<LedgerEntryResponse> {
    const amountPaise = this.toPaise(dto.amount);
    const amount = amountPaise / 100;
    const entry = await this.ledgerRepo.save(
      this.ledgerRepo.create({
        vendorUserId: dto.vendorUserId,
        vendorLeadId: null,
        type: VendorLedgerType.EARNING,
        amount,
        status: VendorLedgerStatus.PENDING,
        description: dto.description?.trim() || 'Admin wallet credit',
      }),
    );

    await this.notifications.create({
      userId: dto.vendorUserId,
      type: NotificationType.VENDOR_PAYOUT,
      title: 'Wallet credited',
      body: `INR ${amount} has been added to your vendor wallet.`,
      metadata: { ledgerEntryId: entry.id },
    });

    return this.mapEntry(entry);
  }

  async createPayoutAccount(
    vendorUserId: number,
    dto: CreatePayoutAccountDto,
  ): Promise<PayoutAccountResponse> {
    const user = await this.usersService.findOne(vendorUserId);
    const razorpayContactId = await this.getOrCreateRazorpayContactId(
      vendorUserId,
      user,
      dto.beneficiaryName,
    );

    const beneficiaryName = dto.beneficiaryName.trim();
    const fundAccount =
      dto.type === VendorPayoutAccountType.BANK_ACCOUNT
        ? await this.razorpayService.createBankFundAccount({
            contactId: razorpayContactId,
            name: beneficiaryName,
            ifsc: this.requireString(dto.ifsc, 'IFSC').toUpperCase(),
            accountNumber: this.requireString(
              dto.accountNumber,
              'Account number',
            ),
          })
        : await this.razorpayService.createVpaFundAccount({
            contactId: razorpayContactId,
            address: this.requireString(dto.vpaAddress, 'VPA address'),
          });

    const account = await this.payoutAccountRepo.save(
      this.payoutAccountRepo.create({
        vendorUserId,
        type: dto.type,
        label: dto.label?.trim() || null,
        beneficiaryName,
        razorpayContactId,
        razorpayFundAccountId: fundAccount.id,
        ifsc: fundAccount.bank_account?.ifsc ?? dto.ifsc?.toUpperCase() ?? null,
        bankName: fundAccount.bank_account?.bank_name ?? null,
        accountNumberLast4:
          dto.accountNumber?.slice(-4) ??
          fundAccount.bank_account?.account_number?.slice(-4) ??
          null,
        vpaAddress: fundAccount.vpa?.address ?? dto.vpaAddress ?? null,
        active: Boolean(fundAccount.active ?? true),
        metadata: { fundAccount: this.sanitizeFundAccount(fundAccount) },
      }),
    );

    return this.mapPayoutAccount(account);
  }

  async listPayoutAccounts(
    vendorUserId: number,
  ): Promise<PayoutAccountResponse[]> {
    const rows = await this.payoutAccountRepo.find({
      where: { vendorUserId, active: true },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.mapPayoutAccount(row));
  }

  async createWithdrawal(
    vendorUserId: number,
    dto: CreateWithdrawalDto,
  ): Promise<WithdrawalResponse> {
    const payoutAccount = await this.payoutAccountRepo.findOne({
      where: {
        id: dto.payoutAccountId,
        vendorUserId,
        active: true,
      },
    });
    if (!payoutAccount) {
      throw new NotFoundException('Payout account not found.');
    }

    const amountPaise = this.toPaise(dto.amount);
    const amount = amountPaise / 100;
    const summary = await this.getSummary(vendorUserId);
    if (summary.availableBalance < amount) {
      throw new BadRequestException('Insufficient vendor wallet balance.');
    }

    const mode = this.getWithdrawalMode(payoutAccount, dto.mode);
    const referenceId = this.makeReference('wd', vendorUserId);
    const idempotencyKey = randomUUID();
    const purpose =
      this.configService.get<string>('RAZORPAY_PAYOUT_PURPOSE')?.trim() ||
      'payout';
    const razorpayXAccountNumber = this.getRazorpayXAccountNumber();

    let withdrawal = await this.withdrawalRepo.save(
      this.withdrawalRepo.create({
        vendorUserId,
        payoutAccountId: payoutAccount.id,
        ledgerEntryId: null,
        amount,
        amountPaise,
        currency: 'INR',
        status: VendorWithdrawalStatus.REQUESTED,
        mode,
        purpose,
        referenceId,
        idempotencyKey,
        razorpayPayoutId: null,
        utr: null,
        webhookEventId: null,
        failureReason: null,
        statusDetails: null,
        metadata: null,
        processedAt: null,
      }),
    );

    const ledger = await this.ledgerRepo.save(
      this.ledgerRepo.create({
        vendorUserId,
        vendorLeadId: null,
        type: VendorLedgerType.PAYOUT,
        amount,
        status: VendorLedgerStatus.PENDING,
        description: dto.description?.trim() || 'Vendor withdrawal requested',
      }),
    );
    withdrawal.ledgerEntryId = ledger.id;
    withdrawal = await this.withdrawalRepo.save(withdrawal);

    try {
      const payout = await this.razorpayService.createPayout(
        {
          accountNumber: razorpayXAccountNumber,
          fundAccountId: payoutAccount.razorpayFundAccountId,
          amountPaise,
          currency: 'INR',
          mode,
          purpose,
          queueIfLowBalance: this.shouldQueueIfLowBalance(),
          referenceId,
          narration: this.getPayoutNarration(),
          notes: {
            vendor_user_id: vendorUserId,
            withdrawal_id: withdrawal.id,
            ledger_entry_id: ledger.id,
          },
        },
        idempotencyKey,
      );

      return this.applyPayoutUpdate(withdrawal, payout, null);
    } catch (error) {
      await this.markWithdrawalFailedBeforePayout(withdrawal, ledger, error);
      throw error;
    }
  }

  async listWithdrawals(
    vendorUserId: number,
    query: ListWithdrawalsQueryDto,
  ): Promise<{
    items: WithdrawalResponse[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const [rows, total] = await this.withdrawalRepo.findAndCount({
      where: { vendorUserId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: rows.map((row) => this.mapWithdrawal(row)),
      total,
      page,
      limit,
    };
  }

  async handlePayoutWebhook(
    payout: Record<string, unknown>,
    webhookEventId: string,
  ): Promise<WithdrawalResponse | null> {
    const payoutId = String(payout.id ?? '');
    const referenceId = String(payout.reference_id ?? '');

    let withdrawal: VendorWithdrawal | null = null;
    if (payoutId) {
      withdrawal = await this.withdrawalRepo.findOne({
        where: { razorpayPayoutId: payoutId },
      });
    }
    if (!withdrawal && referenceId) {
      withdrawal = await this.withdrawalRepo.findOne({
        where: { referenceId },
      });
    }
    if (!withdrawal) return null;

    return this.applyPayoutUpdate(
      withdrawal,
      payout as unknown as RazorpayPayout,
      webhookEventId,
    );
  }

  private async applyPayoutUpdate(
    withdrawal: VendorWithdrawal,
    payout: RazorpayPayout,
    webhookEventId: string | null,
  ): Promise<WithdrawalResponse> {
    const previousStatus = withdrawal.status;
    const nextStatus = this.mapRazorpayPayoutStatus(payout.status);

    withdrawal.status = nextStatus;
    withdrawal.razorpayPayoutId = payout.id || withdrawal.razorpayPayoutId;
    withdrawal.utr = payout.utr ?? withdrawal.utr;
    withdrawal.webhookEventId = webhookEventId ?? withdrawal.webhookEventId;
    withdrawal.statusDetails = payout.status_details ?? null;
    withdrawal.failureReason = this.getFailureReason(nextStatus, payout);
    withdrawal.metadata = { payout: this.sanitizePayout(payout) };
    if (nextStatus === VendorWithdrawalStatus.PROCESSED) {
      withdrawal.processedAt = withdrawal.processedAt ?? new Date();
    }

    const saved = await this.withdrawalRepo.save(withdrawal);
    await this.updateLedgerForWithdrawal(saved);

    if (
      nextStatus === VendorWithdrawalStatus.PROCESSED &&
      previousStatus !== VendorWithdrawalStatus.PROCESSED
    ) {
      await this.settlePendingEarnings(
        saved.vendorUserId,
        Number(saved.amount),
      );
      await this.notifications.create({
        userId: saved.vendorUserId,
        type: NotificationType.VENDOR_PAYOUT,
        title: 'Withdrawal processed',
        body: `₹${Number(saved.amount)} has been sent to your payout account.`,
        metadata: {
          withdrawalId: saved.id,
          payoutId: saved.razorpayPayoutId,
          utr: saved.utr,
        },
      });
    }

    if (
      this.isFailureStatus(nextStatus) &&
      !this.isFailureStatus(previousStatus)
    ) {
      await this.notifications.create({
        userId: saved.vendorUserId,
        type: NotificationType.VENDOR_PAYOUT,
        title: 'Withdrawal failed',
        body:
          saved.failureReason ||
          `Withdrawal #${saved.id} could not be processed.`,
        metadata: {
          withdrawalId: saved.id,
          payoutId: saved.razorpayPayoutId,
        },
      });
    }

    return this.mapWithdrawal(saved);
  }

  private async updateLedgerForWithdrawal(
    withdrawal: VendorWithdrawal,
  ): Promise<void> {
    if (!withdrawal.ledgerEntryId) return;
    const ledger = await this.ledgerRepo.findOne({
      where: { id: withdrawal.ledgerEntryId },
    });
    if (!ledger) return;

    if (withdrawal.status === VendorWithdrawalStatus.PROCESSED) {
      ledger.status = VendorLedgerStatus.SETTLED;
    } else if (this.isFailureStatus(withdrawal.status)) {
      ledger.status = VendorLedgerStatus.FAILED;
    } else {
      ledger.status = VendorLedgerStatus.PENDING;
    }
    await this.ledgerRepo.save(ledger);
  }

  private async markWithdrawalFailedBeforePayout(
    withdrawal: VendorWithdrawal,
    ledger: VendorLedgerEntry,
    error: unknown,
  ): Promise<void> {
    withdrawal.status = VendorWithdrawalStatus.FAILED;
    withdrawal.failureReason = String(error).slice(0, 1000);
    withdrawal.statusDetails = { error: withdrawal.failureReason };
    await this.withdrawalRepo.save(withdrawal);

    ledger.status = VendorLedgerStatus.FAILED;
    await this.ledgerRepo.save(ledger);
  }

  private async settlePendingEarnings(
    vendorUserId: number,
    amount: number,
  ): Promise<void> {
    const pending = await this.ledgerRepo.find({
      where: {
        vendorUserId,
        type: VendorLedgerType.EARNING,
        status: VendorLedgerStatus.PENDING,
      },
      order: { createdAt: 'ASC' },
    });
    let remaining = amount;
    for (const row of pending) {
      if (remaining <= 0) break;
      const rowAmount = Number(row.amount);
      if (rowAmount <= remaining) {
        row.status = VendorLedgerStatus.SETTLED;
        await this.ledgerRepo.save(row);
        remaining -= rowAmount;
      }
    }
  }

  private async getOrCreateRazorpayContactId(
    vendorUserId: number,
    user: {
      name?: string | null;
      email?: string | null;
      phone?: string | null;
    },
    fallbackName: string,
  ): Promise<string> {
    const existing = await this.payoutAccountRepo.findOne({
      where: { vendorUserId },
      order: { createdAt: 'ASC' },
    });
    if (existing?.razorpayContactId) {
      return existing.razorpayContactId;
    }

    const contact = await this.razorpayService.createContact({
      name: this.makeContactName(user.name || fallbackName, vendorUserId),
      email: user.email ?? undefined,
      contact: this.normalizePhoneForRazorpay(user.phone),
      type: 'vendor',
      referenceId: `vendor_${vendorUserId}`.slice(0, 40),
      notes: { vendor_user_id: vendorUserId },
    });

    return contact.id;
  }

  private getWithdrawalMode(
    payoutAccount: VendorPayoutAccount,
    requestedMode?: VendorWithdrawalMode,
  ): VendorWithdrawalMode {
    if (payoutAccount.type === VendorPayoutAccountType.VPA) {
      if (requestedMode && requestedMode !== VendorWithdrawalMode.UPI) {
        throw new BadRequestException('UPI payout account requires UPI mode.');
      }
      return VendorWithdrawalMode.UPI;
    }

    if (requestedMode === VendorWithdrawalMode.UPI) {
      throw new BadRequestException('Bank payout account cannot use UPI mode.');
    }

    return requestedMode ?? VendorWithdrawalMode.IMPS;
  }

  private mapRazorpayPayoutStatus(status?: string): VendorWithdrawalStatus {
    switch ((status || '').toLowerCase()) {
      case 'processed':
        return VendorWithdrawalStatus.PROCESSED;
      case 'failed':
        return VendorWithdrawalStatus.FAILED;
      case 'reversed':
        return VendorWithdrawalStatus.REVERSED;
      case 'cancelled':
        return VendorWithdrawalStatus.CANCELLED;
      case 'rejected':
        return VendorWithdrawalStatus.REJECTED;
      case 'queued':
        return VendorWithdrawalStatus.QUEUED;
      case 'pending':
        return VendorWithdrawalStatus.PENDING;
      case 'initiated':
        return VendorWithdrawalStatus.INITIATED;
      case 'processing':
      default:
        return VendorWithdrawalStatus.PROCESSING;
    }
  }

  private isFailureStatus(status: VendorWithdrawalStatus): boolean {
    return (
      status === VendorWithdrawalStatus.FAILED ||
      status === VendorWithdrawalStatus.REVERSED ||
      status === VendorWithdrawalStatus.CANCELLED ||
      status === VendorWithdrawalStatus.REJECTED
    );
  }

  private getFailureReason(
    status: VendorWithdrawalStatus,
    payout: RazorpayPayout,
  ): string | null {
    if (!this.isFailureStatus(status)) return null;
    const details = payout.status_details;
    const description =
      details && typeof details.description === 'string'
        ? details.description
        : null;
    const reason =
      details && typeof details.reason === 'string' ? details.reason : null;
    return description || reason || `Razorpay payout ${status}.`;
  }

  private getRazorpayXAccountNumber(): string {
    const accountNumber = this.configService
      .get<string>('RAZORPAYX_ACCOUNT_NUMBER')
      ?.trim();
    if (!accountNumber) {
      throw new BadRequestException(
        'RAZORPAYX_ACCOUNT_NUMBER is not configured.',
      );
    }
    return accountNumber;
  }

  private shouldQueueIfLowBalance(): boolean {
    const raw = this.configService
      .get<string>('RAZORPAY_PAYOUT_QUEUE_IF_LOW_BALANCE')
      ?.trim()
      .toLowerCase();
    return raw !== 'false' && raw !== '0' && raw !== 'no';
  }

  private getPayoutNarration(): string {
    const configured =
      this.configService.get<string>('RAZORPAY_PAYOUT_NARRATION') ||
      'FMP Vendor Payout';
    const cleaned = configured
      .replace(/[^a-zA-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 30);
    return cleaned || 'FMP Vendor Payout';
  }

  private requireString(value: string | undefined, label: string): string {
    const trimmed = value?.trim();
    if (!trimmed) {
      throw new BadRequestException(`${label} is required.`);
    }
    return trimmed;
  }

  private toPaise(amount: number): number {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new BadRequestException('Amount must be at least INR 1.');
    }
    return Math.round(parsed * 100);
  }

  private makeReference(prefix: string, userId: number): string {
    return `${prefix}_${userId}_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`.slice(
      0,
      40,
    );
  }

  private makeContactName(name: string, vendorUserId: number): string {
    const cleaned = name.trim().replace(/\s+/g, ' ');
    return cleaned.length >= 3
      ? cleaned.slice(0, 50)
      : `Vendor ${vendorUserId}`;
  }

  private normalizePhoneForRazorpay(phone?: string | null): string | null {
    const digits = phone?.replace(/\D/g, '') ?? '';
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  }

  private sanitizeFundAccount(
    fundAccount: RazorpayFundAccount,
  ): Record<string, unknown> {
    const bankAccount = fundAccount.bank_account ?? null;
    return {
      id: fundAccount.id,
      entity: fundAccount.entity,
      contact_id: fundAccount.contact_id,
      account_type: fundAccount.account_type,
      active: fundAccount.active,
      bank_account: bankAccount
        ? {
            ifsc: bankAccount.ifsc,
            bank_name: bankAccount.bank_name,
            name: bankAccount.name,
            account_number_last4: bankAccount.account_number?.slice(-4) ?? null,
          }
        : undefined,
      vpa: fundAccount.vpa,
      created_at: fundAccount.created_at,
    };
  }

  private sanitizePayout(payout: RazorpayPayout): Record<string, unknown> {
    return {
      id: payout.id,
      fund_account_id: payout.fund_account_id,
      amount: payout.amount,
      currency: payout.currency,
      status: payout.status,
      utr: payout.utr,
      mode: payout.mode,
      purpose: payout.purpose,
      reference_id: payout.reference_id,
      fees: payout.fees,
      tax: payout.tax,
      status_details: payout.status_details,
      created_at: payout.created_at,
    };
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private mapEntry(entry: VendorLedgerEntry): LedgerEntryResponse {
    return {
      id: entry.id,
      vendorUserId: entry.vendorUserId,
      vendorLeadId: entry.vendorLeadId,
      type: entry.type,
      amount: Number(entry.amount),
      status: entry.status,
      description: entry.description,
      createdAt: entry.createdAt,
    };
  }

  private mapPayoutAccount(
    account: VendorPayoutAccount,
  ): PayoutAccountResponse {
    return {
      id: account.id,
      vendorUserId: account.vendorUserId,
      type: account.type,
      label: account.label,
      beneficiaryName: account.beneficiaryName,
      razorpayContactId: account.razorpayContactId,
      razorpayFundAccountId: account.razorpayFundAccountId,
      ifsc: account.ifsc,
      bankName: account.bankName,
      accountNumberLast4: account.accountNumberLast4,
      vpaAddress: account.vpaAddress,
      active: account.active,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }

  private mapWithdrawal(withdrawal: VendorWithdrawal): WithdrawalResponse {
    return {
      id: withdrawal.id,
      vendorUserId: withdrawal.vendorUserId,
      payoutAccountId: withdrawal.payoutAccountId,
      ledgerEntryId: withdrawal.ledgerEntryId,
      amount: Number(withdrawal.amount),
      amountPaise: withdrawal.amountPaise,
      currency: withdrawal.currency,
      status: withdrawal.status,
      mode: withdrawal.mode,
      purpose: withdrawal.purpose,
      referenceId: withdrawal.referenceId,
      razorpayPayoutId: withdrawal.razorpayPayoutId,
      utr: withdrawal.utr,
      failureReason: withdrawal.failureReason,
      statusDetails: withdrawal.statusDetails,
      processedAt: withdrawal.processedAt,
      createdAt: withdrawal.createdAt,
      updatedAt: withdrawal.updatedAt,
    };
  }
}
