import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('vendor_lead_masked_contacts')
export class VendorLeadMaskedContact {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'int' })
  vendorLeadId: number;

  /** ExoPhone / virtual number shown to both parties. */
  @Column({ type: 'varchar', length: 32 })
  virtualNumber: string;

  @Column({ type: 'varchar', length: 32 })
  customerPhone: string;

  @Column({ type: 'varchar', length: 32 })
  vendorPhone: string;

  /** Exotel Connect call SID from the most recent outbound connect. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  lastCallSid: string | null;

  @Column({ type: 'datetime', nullable: true })
  releasedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
