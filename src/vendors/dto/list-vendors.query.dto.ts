import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { VendorVerificationStatus } from '../entities/vendor-profile.entity';

export class ListVendorsQueryDto {
  @IsOptional()
  @IsEnum(VendorVerificationStatus)
  verificationStatus?: VendorVerificationStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
