import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { RazorpayOrder, RazorpayService } from '../razorpay/razorpay.service';
import { CreateAdminTopUpDto } from './dto/create-admin-top-up.dto';
import { ListAdminWalletEntriesQueryDto } from './dto/list-admin-wallet-entries.query.dto';
import { VerifyAdminTopUpDto } from './dto/verify-admin-top-up.dto';
import {
  AdminWalletEntry,
  AdminWalletEntryStatus,
  AdminWalletEntryType,
} from './entities/admin-wallet-entry.entity';

export interface AdminWalletSummary {
  balance: number;
  totalTopUps: number;
  pendingTopUps: number;
  payoutDebits: number;
  pendingPayoutDebits: number;
}

export interface AdminWalletEntryResponse {
  id: number;
  adminUserId: number | null;
  vendorUserId: number | null;
  vendorWithdrawalId: number | null;
  type: string;
  amount: number;
  amountPaise: number;
  currency: string;
  status: string;
  referenceId: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  razorpayPayoutId: string | null;
  paymentMethod: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class AdminWalletService {
  constructor(
    @InjectRepository(AdminWalletEntry)
    private readonly repo: Repository<AdminWalletEntry>,
    private readonly razorpayService: RazorpayService,
  ) {}

  async createTopUp(
    adminUserId: number,
    dto: CreateAdminTopUpDto,
  ): Promise<{
    keyId: string;
    walletEntry: AdminWalletEntryResponse;
    order: {
      id: string;
      amount: number;
      currency: string;
      receipt: string;
      status: string;
    };
  }> {
    const amountPaise = this.toPaise(dto.amount);
    const referenceId = this.makeReference('ew', adminUserId);
    let entry = await this.repo.save(
      this.repo.create({
        adminUserId,
        vendorUserId: null,
        vendorWithdrawalId: null,
        type: AdminWalletEntryType.TOP_UP,
        amount: amountPaise / 100,
        amountPaise,
        currency: 'INR',
        status: AdminWalletEntryStatus.PENDING,
        referenceId,
        razorpayOrderId: null,
        razorpayPaymentId: null,
        razorpayPayoutId: null,
        paymentMethod: dto.method ?? null,
        webhookEventId: null,
        description: dto.description ?? 'Admin wallet top-up',
        metadata: null,
      }),
    );

    const order = await this.razorpayService.createOrder({
      amountPaise,
      currency: entry.currency,
      receipt: referenceId,
      notes: {
        purpose: 'admin_wallet_top_up',
        admin_user_id: adminUserId,
        wallet_entry_id: entry.id,
        payment_method: dto.method ?? 'any',
      },
    });

    entry.razorpayOrderId = order.id;
    entry.metadata = { razorpayOrder: this.sanitizeOrder(order) };
    entry = await this.repo.save(entry);

    return {
      keyId: this.razorpayService.getKeyId(),
      walletEntry: this.mapEntry(entry),
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        status: order.status,
      },
    };
  }

  async getSummary(): Promise<AdminWalletSummary> {
    const entries = await this.repo.find();
    let totalTopUps = 0;
    let pendingTopUps = 0;
    let payoutDebits = 0;
    let pendingPayoutDebits = 0;

    for (const entry of entries) {
      const amount = Number(entry.amount);
      if (
        entry.type === AdminWalletEntryType.TOP_UP &&
        entry.status === AdminWalletEntryStatus.SETTLED
      ) {
        totalTopUps += amount;
      }
      if (
        entry.type === AdminWalletEntryType.TOP_UP &&
        entry.status === AdminWalletEntryStatus.PENDING
      ) {
        pendingTopUps += amount;
      }
      if (
        entry.type === AdminWalletEntryType.VENDOR_PAYOUT &&
        entry.status === AdminWalletEntryStatus.SETTLED
      ) {
        payoutDebits += amount;
      }
      if (
        entry.type === AdminWalletEntryType.VENDOR_PAYOUT &&
        entry.status === AdminWalletEntryStatus.PENDING
      ) {
        pendingPayoutDebits += amount;
      }
    }

    return {
      balance: this.roundMoney(
        totalTopUps - payoutDebits - pendingPayoutDebits,
      ),
      totalTopUps: this.roundMoney(totalTopUps),
      pendingTopUps: this.roundMoney(pendingTopUps),
      payoutDebits: this.roundMoney(payoutDebits),
      pendingPayoutDebits: this.roundMoney(pendingPayoutDebits),
    };
  }

  async verifyTopUpPayment(
    adminUserId: number,
    dto: VerifyAdminTopUpDto,
  ): Promise<AdminWalletEntryResponse> {
    const entry = await this.repo.findOne({
      where: {
        adminUserId,
        razorpayOrderId: dto.razorpayOrderId,
        type: AdminWalletEntryType.TOP_UP,
      },
    });
    if (!entry) {
      throw new NotFoundException('Admin wallet top-up order not found.');
    }

    const isValid = this.razorpayService.verifyPaymentSignature(dto);
    if (!isValid) {
      throw new BadRequestException('Invalid Razorpay payment signature.');
    }

    if (entry.status === AdminWalletEntryStatus.SETTLED) {
      return this.mapEntry(entry);
    }

    entry.status = AdminWalletEntryStatus.SETTLED;
    entry.razorpayPaymentId = dto.razorpayPaymentId;
    entry.metadata = {
      ...(entry.metadata ?? {}),
      checkout: {
        razorpayOrderId: dto.razorpayOrderId,
        razorpayPaymentId: dto.razorpayPaymentId,
      },
    };
    const saved = await this.repo.save(entry);
    return this.mapEntry(saved);
  }

  async listEntries(query: ListAdminWalletEntriesQueryDto): Promise<{
    items: AdminWalletEntryResponse[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const [rows, total] = await this.repo.findAndCount({
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

  async reserveVendorPayoutDebit(input: {
    vendorUserId: number;
    vendorWithdrawalId: number;
    amount: number;
    amountPaise: number;
    referenceId: string;
    description?: string | null;
  }): Promise<AdminWalletEntryResponse> {
    const summary = await this.getSummary();
    if (summary.balance < input.amount) {
      throw new BadRequestException('Insufficient admin wallet balance.');
    }

    const entry = await this.repo.save(
      this.repo.create({
        adminUserId: null,
        vendorUserId: input.vendorUserId,
        vendorWithdrawalId: input.vendorWithdrawalId,
        type: AdminWalletEntryType.VENDOR_PAYOUT,
        amount: input.amount,
        amountPaise: input.amountPaise,
        currency: 'INR',
        status: AdminWalletEntryStatus.PENDING,
        referenceId: input.referenceId,
        razorpayOrderId: null,
        razorpayPaymentId: null,
        razorpayPayoutId: null,
        paymentMethod: null,
        webhookEventId: null,
        description: input.description ?? 'Vendor payout debit',
        metadata: null,
      }),
    );

    return this.mapEntry(entry);
  }

  async markVendorPayoutDebit(input: {
    vendorWithdrawalId: number;
    status: AdminWalletEntryStatus;
    razorpayPayoutId?: string | null;
    webhookEventId?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    const entry = await this.repo.findOne({
      where: {
        vendorWithdrawalId: input.vendorWithdrawalId,
        type: AdminWalletEntryType.VENDOR_PAYOUT,
      },
    });
    if (!entry) return;

    entry.status = input.status;
    if (input.razorpayPayoutId !== undefined) {
      entry.razorpayPayoutId = input.razorpayPayoutId;
    }
    if (input.webhookEventId !== undefined) {
      entry.webhookEventId = input.webhookEventId;
    }
    if (input.metadata !== undefined) {
      entry.metadata = input.metadata;
    }
    await this.repo.save(entry);
  }

  async handlePaymentCaptured(
    payment: Record<string, unknown>,
    webhookEventId: string,
  ): Promise<AdminWalletEntryResponse | null> {
    const orderId = String(payment.order_id ?? '');
    if (!orderId) return null;

    const entry = await this.repo.findOne({
      where: {
        razorpayOrderId: orderId,
        type: AdminWalletEntryType.TOP_UP,
      },
    });
    if (!entry) return null;

    this.assertWebhookAmountMatches(entry, payment);

    entry.status = AdminWalletEntryStatus.SETTLED;
    entry.razorpayPaymentId =
      String(payment.id ?? '') || entry.razorpayPaymentId;
    entry.paymentMethod =
      String(payment.method ?? '') || entry.paymentMethod || null;
    entry.webhookEventId = webhookEventId;
    entry.metadata = { payment: this.sanitizePayment(payment) };
    const saved = await this.repo.save(entry);
    return this.mapEntry(saved);
  }

  async handleOrderPaid(
    order: Record<string, unknown>,
    webhookEventId: string,
  ): Promise<AdminWalletEntryResponse | null> {
    const orderId = String(order.id ?? '');
    if (!orderId) return null;

    const entry = await this.repo.findOne({
      where: {
        razorpayOrderId: orderId,
        type: AdminWalletEntryType.TOP_UP,
      },
    });
    if (!entry) return null;

    const paidAmount = Number(order.amount_paid ?? order.amount ?? 0);
    if (paidAmount < entry.amountPaise) {
      throw new BadRequestException('Razorpay order amount is not fully paid.');
    }

    entry.status = AdminWalletEntryStatus.SETTLED;
    entry.webhookEventId = webhookEventId;
    entry.metadata = { order: this.sanitizeOrder(order) };
    const saved = await this.repo.save(entry);
    return this.mapEntry(saved);
  }

  private assertWebhookAmountMatches(
    entry: AdminWalletEntry,
    payment: Record<string, unknown>,
  ) {
    const paymentAmount = Number(payment.amount);
    const paymentCurrency = String(payment.currency ?? entry.currency);
    if (
      paymentAmount !== entry.amountPaise ||
      paymentCurrency !== entry.currency
    ) {
      throw new BadRequestException('Razorpay payment amount mismatch.');
    }
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

  private sanitizeOrder(order: RazorpayOrder | Record<string, unknown>) {
    return {
      id: order.id,
      amount: order.amount,
      amount_paid: order.amount_paid,
      currency: order.currency,
      receipt: order.receipt,
      status: order.status,
      created_at: order.created_at,
    };
  }

  private sanitizePayment(payment: Record<string, unknown>) {
    return {
      id: payment.id,
      order_id: payment.order_id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      method: payment.method,
      email: payment.email,
      contact: payment.contact,
      created_at: payment.created_at,
    };
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private mapEntry(entry: AdminWalletEntry): AdminWalletEntryResponse {
    return {
      id: entry.id,
      adminUserId: entry.adminUserId,
      vendorUserId: entry.vendorUserId,
      vendorWithdrawalId: entry.vendorWithdrawalId,
      type: entry.type,
      amount: Number(entry.amount),
      amountPaise: entry.amountPaise,
      currency: entry.currency,
      status: entry.status,
      referenceId: entry.referenceId,
      razorpayOrderId: entry.razorpayOrderId,
      razorpayPaymentId: entry.razorpayPaymentId,
      razorpayPayoutId: entry.razorpayPayoutId,
      paymentMethod: entry.paymentMethod,
      description: entry.description,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  }
}
