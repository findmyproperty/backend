import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { VendorVerificationStatus } from '../entities/vendor-profile.entity';

export class AdminUpdateVendorDto {
  @IsOptional()
  @IsEnum(VendorVerificationStatus)
  verificationStatus?: VendorVerificationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rejectionReason?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
