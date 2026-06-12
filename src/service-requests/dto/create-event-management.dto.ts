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
import { BaseServiceRequestDto } from './base-service-request.dto';
import { StopDto } from './stop.dto';

export class EventManagementDetailsDto {
  @IsIn(['birthday', 'wedding', 'baby_shower', 'corporate'])
  eventType: 'birthday' | 'wedding' | 'baby_shower' | 'corporate';

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
  @ArrayMaxSize(7)
  @IsIn(
    [
      'decoration',
      'catering',
      'photography',
      'music',
      'hosting',
      'return_gifts',
      'venue_booking',
    ],
    { each: true },
  )
  services: Array<
    | 'decoration'
    | 'catering'
    | 'photography'
    | 'music'
    | 'hosting'
    | 'return_gifts'
    | 'venue_booking'
  >;

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
