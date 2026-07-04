import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { BaseServiceRequestDto } from './base-service-request.dto';
import { StopDto } from './stop.dto';

export class PackersMoversDetailsDto {
  // Dynamic from admin category mappings for 'packers_movers'
  @IsString()
  moveType: string;

  @IsIn(['1rk', '1', '2', '3', '4+'])
  bhk: '1rk' | '1' | '2' | '3' | '4+';

  /**
   * New structured fields: pickup + drops.
   *
   * Optional at validation time because older clients / graceful fallbacks can still
   * submit plain-text pickupAddress/dropAddress below. At least one representation
   * must be present — enforced in the service layer, not via class-validator, so the
   * DTO remains additive.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => StopDto)
  pickup?: StopDto;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => StopDto)
  drops?: StopDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  pickupAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  dropAddress?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  distanceKm?: number;

  @IsOptional()
  @IsBoolean()
  hasPackingMaterial?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreatePackersMoversDto extends BaseServiceRequestDto {
  @ValidateNested()
  @Type(() => PackersMoversDetailsDto)
  details: PackersMoversDetailsDto;
}
