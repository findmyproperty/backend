import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  ADMIN = 'admin',
  AGENT = 'agent',
  TENANT = 'tenant',
}

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', nullable: true })
  name: string | null;

  @Column({ type: 'varchar', unique: true, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', nullable: true, select: false })
  password: string | null;

  @Column({ type: 'varchar', unique: true, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  googleId: string | null;

  /** Public profile picture URL (e.g. Cloudinary). Optional; falls back to initials in UI. */
  @Column({ type: 'varchar', nullable: true })
  avatarUrl: string | null;

  @Column({ default: false })
  isEmailVerified: boolean;

  @Column({ default: false })
  isPhoneVerified: boolean;

  @Column({ type: 'varchar', nullable: true })
  pendingEmail: string | null;

  @Column({ type: 'varchar', nullable: true, select: false })
  emailOtpHash: string | null;

  @Column({ type: 'timestamp', nullable: true, select: false })
  emailOtpExpiresAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  locationAddress: string | null;

  @Column({ type: 'varchar', nullable: true })
  locationCity: string | null;

  @Column({ type: 'varchar', nullable: true })
  locationState: string | null;

  @Column({ type: 'varchar', nullable: true })
  locationCountry: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number | null;

  @Column({ default: false })
  onboardingCompleted: boolean;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.TENANT })
  role: UserRole;

  /** Preferred / default role for routing and new sessions; backfilled from `role` for legacy rows. */
  @Column({
    type: 'enum',
    enum: UserRole,
    name: 'default_role',
    nullable: true,
  })
  defaultRole: UserRole | null;

  @Column('simple-array', { nullable: true })
  favorites: number[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
