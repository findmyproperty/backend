import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum VendorWithdrawalStatus {
  REQUESTED = 'requested',
  QUEUED = 'queued',
  PENDING = 'pending',
  INITIATED = 'initiated',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  FAILED = 'failed',
  REVERSED = 'reversed',
  CANCELLED = 'cancelled',
  REJECTED = 'rejected',
}

export enum VendorWithdrawalMode {
  UPI = 'UPI',
  IMPS = 'IMPS',
  NEFT = 'NEFT',
  RTGS = 'RTGS',
}

@Entity('vendor_withdrawals')
export class VendorWithdrawal {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int' })
  vendorUserId: number;

  @Index()
  @Column({ type: 'int' })
  payoutAccountId: number;

  @Index()
  @Column({ type: 'int', nullable: true })
  ledgerEntryId: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'int' })
  amountPaise: number;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @Index()
  @Column({
    type: 'varchar',
    length: 32,
    default: VendorWithdrawalStatus.REQUESTED,
  })
  status: VendorWithdrawalStatus;

  @Column({ type: 'varchar', length: 12 })
  mode: VendorWithdrawalMode;

  @Column({ type: 'varchar', length: 40 })
  purpose: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 40 })
  referenceId: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80 })
  idempotencyKey: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80, nullable: true })
  razorpayPayoutId: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  utr: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  webhookEventId: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  failureReason: string | null;

  @Column({ type: 'json', nullable: true })
  statusDetails: Record<string, unknown> | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'timestamp', nullable: true })
  processedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
