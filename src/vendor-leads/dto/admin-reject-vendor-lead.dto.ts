import { IsString, MinLength } from 'class-validator';

export class AdminRejectVendorLeadDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
