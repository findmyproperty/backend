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
  PENDING = 'pending',
  SETTLED = 'settled',
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

  @CreateDateColumn()
  createdAt: Date;
}
