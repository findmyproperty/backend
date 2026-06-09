import { IsEnum, IsOptional } from 'class-validator';
import { VendorLeadStatus } from '../entities/vendor-lead.entity';

export class PatchVendorLeadDto {
  @IsOptional()
  @IsEnum(VendorLeadStatus)
  status?: VendorLeadStatus;
}
