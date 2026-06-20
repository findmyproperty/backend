import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum JobConsultancyType {
  IT = 'it',
  NON_IT = 'non_it',
  CUSTOMER_SUPPORT = 'customer_support',
}

export enum JobConsultancyStatus {
  NEW = 'new',
  CONTACTED = 'contacted',
  SCREENING = 'screening',
  INTERVIEW_SCHEDULED = 'interview_scheduled',
  PLACED = 'placed',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

export interface JobConsultancyDetails {
  notes?: string | null;
}

@Entity('job_consultancy_requests')
export class JobConsultancyRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  consultancyType: JobConsultancyType;

  @Index()
  @Column({
    type: 'varchar',
    length: 32,
    default: JobConsultancyStatus.NEW,
  })
  status: JobConsultancyStatus;

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
  details: JobConsultancyDetails;

  @Column({ type: 'text', nullable: true })
  internalNotes: string | null;

  @Column({ type: 'int', nullable: true })
  assignedAdminId: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}