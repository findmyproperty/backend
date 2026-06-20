import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum EmailLogStatus {
  QUEUED = 'queued',
  SENT = 'sent',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

@Entity('email_logs')
export class EmailLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  templateKey: string;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  feature: string;

  @Column({ type: 'varchar', length: 64 })
  triggerEvent: string;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  recipientEmail: string;

  @Column({ type: 'int', nullable: true })
  recipientUserId: number | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  recipientRole: string | null;

  @Column({ type: 'varchar', length: 500 })
  subject: string;

  @Column({ type: 'varchar', length: 255 })
  fromAddress: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  replyTo: string | null;

  @Column({ type: 'text', nullable: true })
  textBody: string | null;

  @Column({ type: 'text', nullable: true })
  htmlBody: string | null;

  @Column({ type: 'varchar', length: 48, nullable: true })
  entityType: string | null;

  @Index()
  @Column({ type: 'int', nullable: true })
  entityId: number | null;

  @Index()
  @Column({ type: 'varchar', length: 16, default: EmailLogStatus.QUEUED })
  status: EmailLogStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  skippedReason: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  providerMessageId: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'smallint', default: 1 })
  attemptCount: number;

  @Column({ type: 'int', default: 0 })
  resendCount: number;

  @Column({ type: 'int', nullable: true })
  resentFromId: number | null;

  @Column({ type: 'int', nullable: true })
  triggeredByUserId: number | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  sentAt: Date | null;
}