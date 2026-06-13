import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AdminWalletEntryType {
  TOP_UP = 'top_up',
  VENDOR_PAYOUT = 'vendor_payout',
}

export enum AdminWalletEntryStatus {
  PENDING = 'pending',
  SETTLED = 'settled',
  FAILED = 'failed',
}

@Entity('admin_wallet_entries')
export class AdminWalletEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int', nullable: true })
  adminUserId: number | null;

  @Index()
  @Column({ type: 'int', nullable: true })
  vendorUserId: number | null;

  @Index()
  @Column({ type: 'int', nullable: true })
  vendorWithdrawalId: number | null;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  type: AdminWalletEntryType;

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
    default: AdminWalletEntryStatus.PENDING,
  })
  status: AdminWalletEntryStatus;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 40 })
  referenceId: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 40, nullable: true })
  razorpayOrderId: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 40, nullable: true })
  razorpayPaymentId: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 40, nullable: true })
  razorpayPayoutId: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  paymentMethod: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  webhookEventId: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
