import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum VendorCategory {
  REAL_ESTATE = 'real_estate',
  HOME_SERVICES = 'home_services',
  PACKERS = 'packers',
  LAWYER = 'lawyer',
  CA = 'ca',
  WEB_DESIGNER = 'web_designer',
  TRAINER = 'trainer',
  TUTOR = 'tutor',
  OTHER = 'other',
}

export enum VendorVerificationStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

export interface VendorKycDocuments {
  aadhaarUrl?: string | null;
  panUrl?: string | null;
  gstUrl?: string | null;
  businessProofUrl?: string | null;
  addressProofUrl?: string | null;
}

@Entity('vendor_profiles')
export class VendorProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 160, nullable: true })
  businessName: string | null;

  @Column({
    type: 'varchar',
    length: 32,
    default: VendorCategory.OTHER,
  })
  category: VendorCategory;

  @Column({
    type: 'varchar',
    length: 32,
    default: VendorVerificationStatus.PENDING,
  })
  verificationStatus: VendorVerificationStatus;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ type: 'json', nullable: true })
  documents: VendorKycDocuments | null;

  @Column({ type: 'text', nullable: true })
  experience: string | null;

  @Column({ type: 'simple-array', nullable: true })
  serviceLocations: string[] | null;

  @Column({ type: 'text', nullable: true })
  about: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  workingHours: string | null;

  @Column({ type: 'json', nullable: true })
  publicPhotoUrls: string[] | null;

  @Column({ type: 'json', nullable: true })
  certificateUrls: string[] | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80, nullable: true })
  slug: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
