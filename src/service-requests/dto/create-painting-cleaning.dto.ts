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
  @IsIn([
    'full_painting',
    'partial_painting',
    'deep_cleaning',
    'bathroom_cleaning',
    'sofa_cleaning',
    'kitchen_cleaning',
  ])
  subType:
    | 'full_painting'
    | 'partial_painting'
    | 'deep_cleaning'
    | 'bathroom_cleaning'
    | 'sofa_cleaning'
    | 'kitchen_cleaning';

  @IsIn(['apartment', 'villa', 'office'])
  propertyType: 'apartment' | 'villa' | 'office';

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
