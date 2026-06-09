import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class AdminCreateVendorLeadDto {
  @IsInt()
  @Min(1)
  vendorUserId: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  serviceRequestId?: number;

  @IsString()
  @MaxLength(120)
  customerName: string;

  @IsString()
  @MaxLength(32)
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  area?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  budget?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  requirement?: string;

  @IsOptional()
  @IsString()
  preferredDate?: string;
}
