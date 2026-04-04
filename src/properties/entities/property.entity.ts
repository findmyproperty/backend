import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import {
  ListingType,
  PropertyType,
  PropertyStatus,
  FloorPlanDto,
} from '../dto/create-property.dto';

@Entity()
export class Property {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column('text', { nullable: true })
  description: string;

  @Column('decimal')
  price: number;

  @Column()
  currency: string;

  @Column({
    type: 'simple-enum',
    enum: ListingType,
  })
  listingType: ListingType;

  @Column({
    type: 'simple-enum',
    enum: PropertyType,
  })
  propertyType: PropertyType;

  @Column()
  address: string;

  @Column()
  locality: string;

  @Column()
  city: string;

  @Column({ nullable: true })
  state: string;

  @Column()
  country: string;

  @Column()
  bedrooms: number;

  @Column('decimal')
  bathrooms: number;

  @Column('decimal')
  area: number;

  @Column()
  yearBuilt: number;

  @Column('simple-array', { nullable: true })
  amenities: string[];

  @Column({ nullable: true })
  videoUrl: string;

  @Column('simple-array', { nullable: true })
  propertyImages: string[];

  @Column({ nullable: true })
  thumbnailUrl: string;

  @Column({ type: 'json', nullable: true })
  floorPlans: FloorPlanDto[];

  @Column({
    type: 'simple-enum',
    enum: PropertyStatus,
    default: PropertyStatus.PENDING,
  })
  status: PropertyStatus;

  @Column('text', { nullable: true })
  reason: string;

  @Column({ nullable: true })
  createdBy: number;

  /** Listing agent who receives tenant leads; falls back to createdBy when unset (legacy rows). */
  @Column({ type: 'int', nullable: true })
  assignedAgentId: number | null;
}
