import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum VendorPayoutAccountType {
  BANK_ACCOUNT = 'bank_account',
  VPA = 'vpa',
}

@Index(['vendorUserId', 'active'])
@Entity('vendor_payout_accounts')
export class VendorPayoutAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int' })
  vendorUserId: number;

  @Column({ type: 'varchar', length: 32 })
  type: VendorPayoutAccountType;

  @Column({ type: 'varchar', length: 80, nullable: true })
  label: string | null;

  @Column({ type: 'varchar', length: 120 })
  beneficiaryName: string;

  @Column({ type: 'varchar', length: 80 })
  razorpayContactId: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80 })
  razorpayFundAccountId: string;

  @Column({ type: 'varchar', length: 11, nullable: true })
  ifsc: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  bankName: string | null;

  @Column({ type: 'varchar', length: 4, nullable: true })
  accountNumberLast4: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  vpaAddress: string | null;

  @Column({ default: true })
  active: boolean;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
