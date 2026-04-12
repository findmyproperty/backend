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

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole = UserRole.TENANT;
}
