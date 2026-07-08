import { IsString, MinLength } from 'class-validator';

export class AdminReopenVendorLeadSettlementDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
