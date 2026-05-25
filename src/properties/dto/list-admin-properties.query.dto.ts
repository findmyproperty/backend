import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PropertyStatus } from './create-property.dto';

/** Sortable columns for admin property tables. */
export enum AdminPropertySortBy {
  ID = 'id',
  TITLE = 'title',
  CITY = 'city',
  LISTING_TYPE = 'listingType',
  PROPERTY_TYPE = 'propertyType',
  PRICE = 'price',
  BEDROOMS = 'bedrooms',
  BATHROOMS = 'bathrooms',
  AREA = 'area',
  STATUS = 'status',
}

export enum AdminPropertySortDir {
  ASC = 'asc',
  DESC = 'desc',
}

export class ListAdminPropertiesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  /** `rent` matches Rent + Lease; `sale` matches Sale. */
  @IsOptional()
  @IsIn(['rent', 'sale'])
  listing?: 'rent' | 'sale';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  propertyType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assignedAgentId?: number;

  @IsOptional()
  @IsEnum(AdminPropertySortBy)
  sortBy?: AdminPropertySortBy = AdminPropertySortBy.ID;

  @IsOptional()
  @IsEnum(AdminPropertySortDir)
  sortDir?: AdminPropertySortDir = AdminPropertySortDir.DESC;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

/** Same filters as list query, minus pagination/sort/status (for tab counts). */
export class AdminPropertyStatsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsIn(['rent', 'sale'])
  listing?: 'rent' | 'sale';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  propertyType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assignedAgentId?: number;
}
