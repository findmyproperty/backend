import {
  IsOptional,
  IsString,
  MaxLength,
  IsArray,
  IsObject,
  Matches,
  IsInt,
} from 'class-validator';
import type { VendorKycDocuments } from '../entities/vendor-profile.entity';

export class UpdateVendorMeDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  businessName?: string;

  /**
   * Array of category IDs from admin categories table.
   */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  categoryIds?: number[];

  @IsOptional()
  @IsObject()
  documents?: VendorKycDocuments;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  experience?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceLocations?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  about?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  workingHours?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  publicPhotoUrls?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  certificateUrls?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase letters, numbers, and hyphens',
  })
  slug?: string | null;
}
