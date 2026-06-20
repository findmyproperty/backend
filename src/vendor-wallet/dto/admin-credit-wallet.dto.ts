import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AdminCreditWalletDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  vendorUserId: number;

  @IsNumber()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;
}
