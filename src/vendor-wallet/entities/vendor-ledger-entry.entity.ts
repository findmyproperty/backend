import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum VendorLedgerType {
  EARNING = 'earning',
  COMMISSION = 'commission',
  PAYOUT = 'payout',
}

export enum VendorLedgerStatus {
  PAYMENT_PENDING = 'payment_pending',
  PENDING = 'pending',
  SETTLED = 'settled',
  FAILED = 'failed',
}

@Entity('vendor_ledger_entries')
export class VendorLedgerEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int' })
  vendorUserId: number;

  @Index()
  @Column({ type: 'int', nullable: true })
  vendorLeadId: number | null;

  @Column({ type: 'varchar', length: 32 })
  type: VendorLedgerType;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 32, default: VendorLedgerStatus.PENDING })
  status: VendorLedgerStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80, nullable: true })
  externalReferenceId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  webhookEventId: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
