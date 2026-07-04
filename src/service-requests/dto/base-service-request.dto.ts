import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PreferredSlot } from '../entities/service-request.entity';

/**
 * Shared contact/scheduling fields used by both Packers & Movers and
 * Painting & Cleaning request forms. Concrete DTOs extend this and add a
 * typed `details` object of their own.
 */
export abstract class BaseServiceRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  /** Loose E.164-ish check; UI is free to be stricter. */
  @IsString()
  @Matches(/^\+?[0-9\s\-()]{7,20}$/, {
    message: 'Phone must be a valid phone number.',
  })
  @MaxLength(32)
  phone: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressLine?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  pincode?: string;

  /** ISO-8601 date (YYYY-MM-DD). */
  @IsOptional()
  @IsISO8601({ strict: false })
  preferredDate?: string;

  @IsOptional()
  @IsEnum(PreferredSlot)
  preferredSlot?: PreferredSlot;

  /** Optional Google reCAPTCHA token; enforced when RECAPTCHA_SECRET_KEY is set. */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  recaptchaToken?: string;

  /** Optional customer-selected verified vendor for this service request. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assignedVendorUserId?: number;
}
