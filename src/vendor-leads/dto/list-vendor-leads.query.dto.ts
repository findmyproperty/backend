import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { VendorLeadStatus } from '../entities/vendor-lead.entity';

export class ListVendorLeadsQueryDto {
  @IsOptional()
  @IsEnum(VendorLeadStatus)
  status?: VendorLeadStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  serviceRequestId?: number;

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
