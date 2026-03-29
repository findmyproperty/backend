import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

@Entity('settings')
export class Setting {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255, default: 'Find My Property' })
  site_name: string;

  @Column({ type: 'varchar', length: 255, default: 'support@example.com' })
  support_email: string;

  @Column({ type: 'boolean', default: false })
  auto_approve_listings: boolean;

  @Column({ type: 'boolean', default: true })
  new_agent_registration: boolean;

  @Column({ type: 'varchar', length: 50, default: 'modern-blue' })
  theme: string;

  @Column({ type: 'text', nullable: true })
  primary_logo_url: string | null;

  @Column({ type: 'text', nullable: true })
  favicon_url: string | null;

  @Column({ type: 'text', nullable: true })
  cloudinary_api_key: string | null;

  @Column({ type: 'text', nullable: true })
  google_maps_key: string | null;

  @Column({ type: 'boolean', default: true })
  two_factor_auth_enforced: boolean;

  @UpdateDateColumn()
  updated_at: Date;
}
