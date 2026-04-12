import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateContactDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(10000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  /**
   * Honeypot — must be omitted or empty. Hide the field in the UI (e.g. `display:none`, `tabIndex={-1}`, `autoComplete="off"`).
   */
  @IsOptional()
  @IsString()
  @Matches(/^$/, { message: 'Invalid request' })
  website?: string;

  /** Google reCAPTCHA v2/v3 response token from the client. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  recaptchaToken?: string;
}
