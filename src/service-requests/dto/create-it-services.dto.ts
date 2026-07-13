import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { BaseServiceRequestDto } from './base-service-request.dto';

export class ItServicesDetailsDto {
  @IsString()
  subType: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateItServicesDto extends BaseServiceRequestDto {
  @ValidateNested()
  @Type(() => ItServicesDetailsDto)
  details: ItServicesDetailsDto;
}
