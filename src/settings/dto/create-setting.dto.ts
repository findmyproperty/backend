import {
  IsString,
  IsBoolean,
  IsOptional,
  IsEmail,
  IsUrl,
  Matches,
  MaxLength,
  IsIn,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

/** Treat `""` and whitespace as null so "clear field" flows don't trip validators. */
const emptyStringToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

/**
 * Payload shape for writing application settings.
 *
 * Field names are camelCase to stay consistent with the frontend Zod schema in
 * `schema/setting.ts`. The DB layer maps these to snake_case columns via the
 * entity decorators.
 */
export class CreateSettingDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  siteName?: string;

  @IsOptional()
  @IsEmail()
  supportEmail?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(30)
  // Accept E.164 / common international formats: digits, spaces, dashes, parens,
  // optional leading + — matches what a human would type in a phone field.
  @Matches(/^[+]?[0-9 ()\-]{6,30}$/, {
    message: 'supportPhone must be a valid phone number',
  })
  supportPhone?: string | null;

  @IsOptional()
  @IsBoolean()
  autoApproveListings?: boolean;

  @IsOptional()
  @IsBoolean()
  newAgentRegistration?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['modern-blue', 'nature-green', 'deep-indigo'])
  theme?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsUrl({ require_tld: false })
  primaryLogoUrl?: string | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsUrl({ require_tld: false })
  faviconUrl?: string | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  cloudinaryApiKey?: string | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  googleMapsKey?: string | null;

  @IsOptional()
  @IsBoolean()
  twoFactorAuthEnforced?: boolean;
}
