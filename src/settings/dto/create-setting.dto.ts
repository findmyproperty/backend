import {
  IsString,
  IsBoolean,
  IsOptional,
  IsEmail,
  IsUrl,
} from 'class-validator';

export class CreateSettingDto {
  @IsOptional()
  @IsString()
  site_name?: string;

  @IsOptional()
  @IsEmail()
  support_email?: string;

  @IsOptional()
  @IsBoolean()
  auto_approve_listings?: boolean;

  @IsOptional()
  @IsBoolean()
  new_agent_registration?: boolean;

  @IsOptional()
  @IsString()
  theme?: string;

  @IsOptional()
  @IsUrl()
  primary_logo_url?: string;

  @IsOptional()
  @IsUrl()
  favicon_url?: string;

  @IsOptional()
  @IsString()
  cloudinary_api_key?: string;

  @IsOptional()
  @IsString()
  google_maps_key?: string;

  @IsOptional()
  @IsBoolean()
  two_factor_auth_enforced?: boolean;

  @IsOptional()
  id?: number;

  @IsOptional()
  updated_at?: string | Date;
}
