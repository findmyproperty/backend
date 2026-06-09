import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum VendorLeadStatus {
  NEW = 'new',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

@Entity('vendor_leads')
export class VendorLead {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int' })
  vendorUserId: number;

  @Index()
  @Column({ type: 'int', nullable: true })
  serviceRequestId: number | null;

  @Column({ type: 'varchar', length: 120 })
  customerName: string;

  @Column({ type: 'varchar', length: 32 })
  phone: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  area: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  budget: string | null;

  @Column({ type: 'text', nullable: true })
  requirement: string | null;

  @Column({ type: 'date', nullable: true })
  preferredDate: string | null;

  @Column({
    type: 'varchar',
    length: 32,
    default: VendorLeadStatus.NEW,
  })
  status: VendorLeadStatus;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 10 })
  commissionPercent: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  jobAmount: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
