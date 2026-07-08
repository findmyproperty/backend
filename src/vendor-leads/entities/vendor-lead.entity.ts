import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum VendorLeadStatus {
  /** @deprecated Migrated to open — do not assign for new leads */
  NEW = 'new',
  PENDING_ADMIN_REVIEW = 'pending_admin_review',
  OPEN = 'open',
  ADMIN_REJECTED = 'admin_rejected',
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
    default: VendorLeadStatus.PENDING_ADMIN_REVIEW,
  })
  status: VendorLeadStatus;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 10 })
  commissionPercent: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  jobAmount: number | null;

  @Column({ type: 'datetime', nullable: true })
  adminApprovedAt: Date | null;

  @Column({ type: 'int', nullable: true })
  adminApprovedByUserId: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  adminApprovalNotes: string | null;

  @Column({ type: 'datetime', nullable: true })
  adminRejectedAt: Date | null;

  @Column({ type: 'int', nullable: true })
  adminRejectedByUserId: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  adminRejectionReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
