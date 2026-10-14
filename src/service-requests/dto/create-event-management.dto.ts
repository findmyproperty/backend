import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  EVENT_MANAGEMENT_SERVICE_KEYS,
  type EventManagementServiceKey,
} from '../event-management.constants';
import { BaseServiceRequestDto } from './base-service-request.dto';
import { StopDto } from './stop.dto';

export class EventManagementDetailsDto {
  // Dynamic from admin category mappings for 'event_management'
  @IsString()
  eventType: string;

  @IsIn(['home', 'banquet', 'hotel', 'outdoor', 'office', 'other'])
  venueType: 'home' | 'banquet' | 'hotel' | 'outdoor' | 'office' | 'other';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  guestCount: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  budgetRange?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsIn([...EVENT_MANAGEMENT_SERVICE_KEYS], { each: true })
  services: EventManagementServiceKey[];

  @IsOptional()
  @ValidateNested()
  @Type(() => StopDto)
  location?: StopDto;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  themeOrStyle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateEventManagementDto extends BaseServiceRequestDto {
  @ValidateNested()
  @Type(() => EventManagementDetailsDto)
  details: EventManagementDetailsDto;
}
