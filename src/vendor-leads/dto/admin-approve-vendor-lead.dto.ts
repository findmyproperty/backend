import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminApproveVendorLeadDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
