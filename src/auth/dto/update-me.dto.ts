import { IsEmail, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { UserRole } from 'src/users/entities/user.entity';

export class UpdateMeDto {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string | null;

  @IsString()
  @IsOptional()
  locationAddress?: string;

  @IsString()
  @IsOptional()
  locationCity?: string;

  @IsString()
  @IsOptional()
  locationState?: string;

  @IsString()
  @IsOptional()
  locationCountry?: string;

  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;

  // No default value here on purpose: with the global ValidationPipe's
  // `transform: true`, a default would silently demote any user who PATCHes
  // /auth/me without an explicit `role` (e.g. saving just their name).
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;
}
