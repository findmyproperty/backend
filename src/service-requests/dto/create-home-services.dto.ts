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

export class HomeServicesDetailsDto {
  @IsIn(['carpenter', 'plumber', 'electrician'])
  subType: 'carpenter' | 'plumber' | 'electrician';

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

export class CreateHomeServicesDto extends BaseServiceRequestDto {
  @ValidateNested()
  @Type(() => HomeServicesDetailsDto)
  details: HomeServicesDetailsDto;
}