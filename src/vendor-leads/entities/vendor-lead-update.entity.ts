import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('vendor_lead_updates')
export class VendorLeadUpdate {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int' })
  vendorLeadId: number;

  @Column({ type: 'varchar', length: 64 })
  milestone: string;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'json', nullable: true })
  photoUrls: string[] | null;

  @CreateDateColumn()
  createdAt: Date;
}
