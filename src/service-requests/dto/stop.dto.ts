import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Shared geocoded-point payload for service requests.
 *
 * Both Packers & Movers (pickup + drops[]) and Painting & Cleaning (location)
 * use this shape, captured client-side via Google Places Autocomplete.
 */
export class StopDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  label: string;

  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  placeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
