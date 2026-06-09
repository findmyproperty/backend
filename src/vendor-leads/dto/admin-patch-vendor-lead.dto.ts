import { IsEnum, IsInt, IsNumber, IsOptional, Min } from 'class-validator';
import { VendorLeadStatus } from '../entities/vendor-lead.entity';

export class AdminPatchVendorLeadDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  vendorUserId?: number;

  @IsOptional()
  @IsEnum(VendorLeadStatus)
  status?: VendorLeadStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  jobAmount?: number | null;
}
