import {
  IsString,
  IsNumber,
  IsEnum,
  IsArray,
  IsOptional,
  IsInt,
  IsObject,
  Min,
  Max,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ListingType {
  RENT = 'Rent',
  SALE = 'Sale',
  LEASE = 'Lease',
}

/**
 * Legacy hardcoded values kept for reference / fallbacks.
 * Dynamic categories are now managed via the /categories admin API.
 * propertyType on properties is stored as free-form string.
 */
export enum PropertyType {
  HOUSE = 'House',
  APARTMENT = 'Apartment',
  VILLA = 'Villa',
  TOWNHOME = 'Townhome',
}

export enum PropertyStatus {
  PENDING = 'Pending',
  APPROVED = 'Approved',
  REJECTED = 'Rejected',
}

export enum FurnishingType {
  UNFURNISHED = 'unfurnished',
  SEMI_FURNISHED = 'semi-furnished',
  FURNISHED = 'furnished',
}

export class FloorPlanDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  floorName: string;

  @IsOptional()
  @IsString()
  customName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bathrooms?: number;

  @IsString()
  imageUrl: string;
}

export class CreatePropertyDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsString()
  currency: string; // Keeping currency since backend had it previously

  @IsEnum(ListingType)
  listingType: ListingType;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  propertySector?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  postingType?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsObject()
  details?: Record<string, unknown> | null;

  // Accepts any category name managed via the admin Categories API.
  @IsString()
  propertyType: string;

  @IsOptional()
  @IsEnum(FurnishingType)
  furnishing?: FurnishingType;

  @IsString()
  address: string;

  @IsString()
  locality: string;

  @IsString()
  city: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsString()
  country: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  bedrooms?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  bathrooms?: number | null;

  @IsNumber()
  @Min(0)
  area: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(1900)
  yearBuilt?: number | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  propertyImages?: string[];

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FloorPlanDto)
  floorPlans?: FloorPlanDto[];

  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;

  @IsOptional()
  @IsString()
  reason?: string;

  /** Admin may set the listing agent; agents get this automatically on create. */
  @IsOptional()
  @IsInt()
  @Min(1)
  assignedAgentId?: number;
}
