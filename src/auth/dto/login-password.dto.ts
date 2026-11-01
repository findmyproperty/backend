import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class LoginPasswordDto {
  /** E.164 phone — required when `email` is omitted. */
  @ValidateIf((o: LoginPasswordDto) => !o.email?.trim())
  @IsString()
  @IsOptional()
  phone?: string;

  /** Account email — required when `phone` is omitted. */
  @ValidateIf((o: LoginPasswordDto) => !o.phone?.trim())
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
