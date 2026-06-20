import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum NotificationType {
  VENDOR_LEAD_ASSIGNED = 'vendor_lead_assigned',
  VENDOR_LEAD_STATUS = 'vendor_lead_status',
  VENDOR_VERIFIED = 'vendor_verified',
  VENDOR_REJECTED = 'vendor_rejected',
  VENDOR_PAYOUT = 'vendor_payout',
  SUPPORT_REPLY = 'support_reply',
  EMAIL_RECEIVED = 'email_received',
  PROPERTY_LEAD_NEW = 'property_lead_new',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 48 })
  type: NotificationType;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ default: false })
  read: boolean;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
