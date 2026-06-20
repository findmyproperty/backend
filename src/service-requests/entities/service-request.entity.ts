import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ServiceType {
  PACKERS_MOVERS = 'packers_movers',
  PAINTING_CLEANING = 'painting_cleaning',
  HOME_SERVICES = 'home_services',
  EVENT_MANAGEMENT = 'event_management',
}

/** Avoid MySQL ENUM for status (reserved word issues with `new`); mirror LeadStatus pattern. */
export enum ServiceRequestStatus {
  NEW = 'new',
  CONTACTED = 'contacted',
  SCHEDULED = 'scheduled',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum PreferredSlot {
  MORNING = 'morning',
  AFTERNOON = 'afternoon',
  EVENING = 'evening',
}

/** Geocoded point captured via Google Places Autocomplete on the client. */
export interface Stop {
  label: string;
  lat: number;
  lng: number;
  placeId?: string | null;
  notes?: string | null;
}

/** Server-computed trip summary (via Distance Matrix) persisted alongside the request. */
export interface TripEstimate {
  distanceKm: number;
  durationMin: number;
  legs: Array<{ distanceKm: number; durationMin: number }>;
  calculatedAt: string; // ISO timestamp
}

export interface PackersMoversDetails {
  moveType: 'home' | 'office' | 'vehicle';
  bhk: '1rk' | '1' | '2' | '3' | '4+';
  /** New multi-stop representation. Optional so legacy rows (only addresses) still parse. */
  pickup?: Stop;
  drops?: Stop[];
  trip?: TripEstimate;
  /** Legacy plain-text fields kept for rows created before multi-stop support. */
  pickupAddress?: string;
  dropAddress?: string;
  distanceKm?: number | null;
  hasPackingMaterial?: boolean;
  notes?: string | null;
}

export interface PaintingCleaningDetails {
  subType:
    | 'full_painting'
    | 'partial_painting'
    | 'deep_cleaning'
    | 'bathroom_cleaning'
    | 'sofa_cleaning'
    | 'kitchen_cleaning';
  propertyType: 'apartment' | 'villa' | 'office';
  bhkOrSqft: string;
  /** Geocoded service location (optional for graceful fallback / legacy rows). */
  location?: Stop;
  notes?: string | null;
}

export interface HomeServicesDetails {
  subType: 'carpenter' | 'plumber' | 'electrician';
  propertyType: 'apartment' | 'villa' | 'office';
  bhkOrSqft: string;
  location?: Stop;
  notes?: string | null;
}

export interface EventManagementDetails {
  eventType: 'birthday' | 'wedding' | 'baby_shower' | 'corporate';
  venueType: 'home' | 'banquet' | 'hotel' | 'outdoor' | 'office' | 'other';
  guestCount: number;
  budgetRange?: string | null;
  services: Array<
    | 'decoration'
    | 'catering'
    | 'photography'
    | 'music'
    | 'hosting'
    | 'return_gifts'
    | 'venue_booking'
  >;
  location?: Stop;
  themeOrStyle?: string | null;
  notes?: string | null;
}

export type ServiceRequestDetails =
  | PackersMoversDetails
  | PaintingCleaningDetails
  | HomeServicesDetails
  | EventManagementDetails;

@Entity('service_requests')
export class ServiceRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  serviceType: ServiceType;

  @Index()
  @Column({
    type: 'varchar',
    length: 32,
    default: ServiceRequestStatus.NEW,
  })
  status: ServiceRequestStatus;

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

  @Column({ type: 'varchar', length: 500, nullable: true })
  addressLine: string | null;

  @Column({ type: 'varchar', length: 12, nullable: true })
  pincode: string | null;

  @Column({ type: 'date', nullable: true })
  preferredDate: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  preferredSlot: PreferredSlot | null;

  @Column({ type: 'json', nullable: true })
  details: ServiceRequestDetails | null;

  @Column({ type: 'text', nullable: true })
  internalNotes: string | null;

  @Column({ type: 'int', nullable: true })
  assignedAdminId: number | null;

  @Index()
  @Column({ type: 'int', nullable: true })
  assignedVendorUserId: number | null;

  @Column({ type: 'int', nullable: true })
  customerRating: number | null;

  @Column({ type: 'text', nullable: true })
  customerFeedback: string | null;

  @Column({ type: 'datetime', nullable: true })
  customerReviewedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
