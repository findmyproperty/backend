import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum LeadStatus {
  NEW = 'new',
  CONTACTED = 'contacted',
  CLOSED = 'closed',
  ARCHIVED = 'archived',
}

@Entity('property_leads')
export class PropertyLead {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  propertyId: number;

  @Column({ type: 'int' })
  tenantUserId: number;

  @Column({ type: 'int' })
  agentUserId: number;

  @Column('text', { nullable: true })
  message: string | null;

  /** Stored as varchar: MySQL ENUM + value `new` breaks (reserved word). */
  @Column({ type: 'varchar', length: 32, default: LeadStatus.NEW })
  status: LeadStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
