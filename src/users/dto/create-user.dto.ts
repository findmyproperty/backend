import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { UserRole } from '../entities/user.entity';

export class CreateUserDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  googleId?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string | null;

  @IsBoolean()
  @IsOptional()
  isEmailVerified?: boolean;

  @IsBoolean()
  @IsOptional()
  isPhoneVerified?: boolean;

  @IsString()
  @IsOptional()
  pendingEmail?: string | null;

  @IsString()
  @IsOptional()
  emailOtpHash?: string | null;

  @IsOptional()
  emailOtpExpiresAt?: Date | null;

  @IsString()
  @IsOptional()
  locationAddress?: string | null;

  @IsString()
  @IsOptional()
  locationCity?: string | null;

  @IsString()
  @IsOptional()
  locationState?: string | null;

  @IsString()
  @IsOptional()
  locationCountry?: string | null;

  @IsNumber()
  @IsOptional()
  latitude?: number | null;

  @IsNumber()
  @IsOptional()
  longitude?: number | null;

  @IsBoolean()
  @IsOptional()
  onboardingCompleted?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole = UserRole.TENANT;
}
