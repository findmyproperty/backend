import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum LoanType {
  HOME_LOAN = 'home_loan',
  PERSONAL_LOAN = 'personal_loan',
  VEHICLE_LOAN = 'vehicle_loan',
  MORTGAGE = 'mortgage',
}

export enum LoanRequestStatus {
  NEW = 'new',
  CONTACTED = 'contacted',
  DOCUMENTS_PENDING = 'documents_pending',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  DISBURSED = 'disbursed',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

export interface LoanRequestDetails {
  notes?: string | null;
}

@Entity('loan_requests')
export class LoanRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  loanType: LoanType;

  @Index()
  @Column({
    type: 'varchar',
    length: 32,
    default: LoanRequestStatus.NEW,
  })
  status: LoanRequestStatus;

  @Index()
  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 32 })
  phone: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  city: string | null;

  @Column({ type: 'json' })
  details: LoanRequestDetails;

  @Column({ type: 'text', nullable: true })
  internalNotes: string | null;

  @Column({ type: 'int', nullable: true })
  assignedAdminId: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}