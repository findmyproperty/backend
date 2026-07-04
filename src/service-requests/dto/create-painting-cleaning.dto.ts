import { Type } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { BaseServiceRequestDto } from './base-service-request.dto';
import { StopDto } from './stop.dto';

export class PaintingCleaningDetailsDto {
  // Dynamic from admin category mappings for 'painting_cleaning'
  @IsString()
  subType: string;

  // Relaxed to support dynamic property categories
  @IsString()
  propertyType: string;

  @IsString()
  @MaxLength(60)
  bhkOrSqft: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => StopDto)
  location?: StopDto;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreatePaintingCleaningDto extends BaseServiceRequestDto {
  @ValidateNested()
  @Type(() => PaintingCleaningDetailsDto)
  details: PaintingCleaningDetailsDto;
}
