import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Global application settings. A single row (id = 1) holds the active config.
 *
 * Property names are camelCase to match the public API surface; the DB columns
 * keep their original snake_case names via the `name` option so we don't
 * disturb existing data (TypeORM `synchronize: true` would otherwise recreate
 * columns on rename).
 */
@Entity('settings')
export class Setting {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    name: 'site_name',
    type: 'varchar',
    length: 255,
    default: 'Find My Property',
  })
  siteName: string;

  @Column({
    name: 'support_email',
    type: 'varchar',
    length: 255,
    default: 'support@example.com',
  })
  supportEmail: string;

  @Column({
    name: 'support_phone',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  supportPhone: string | null;

  @Column({ name: 'auto_approve_listings', type: 'boolean', default: false })
  autoApproveListings: boolean;

  @Column({ name: 'new_agent_registration', type: 'boolean', default: true })
  newAgentRegistration: boolean;

  @Column({ type: 'varchar', length: 50, default: 'modern-blue' })
  theme: string;

  @Column({ name: 'primary_logo_url', type: 'text', nullable: true })
  primaryLogoUrl: string | null;

  @Column({ name: 'favicon_url', type: 'text', nullable: true })
  faviconUrl: string | null;

  @Column({ name: 'cloudinary_api_key', type: 'text', nullable: true })
  cloudinaryApiKey: string | null;

  @Column({ name: 'google_maps_key', type: 'text', nullable: true })
  googleMapsKey: string | null;

  @Column({ name: 'two_factor_auth_enforced', type: 'boolean', default: true })
  twoFactorAuthEnforced: boolean;

  @Column({
    name: 'vendor_commission_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 10,
  })
  vendorCommissionPercent: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
