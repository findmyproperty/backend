import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VendorWithdrawalMode } from '../entities/vendor-withdrawal.entity';

export class CreateWithdrawalDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  payoutAccountId: number;

  @IsNumber()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsEnum(VendorWithdrawalMode)
  mode?: VendorWithdrawalMode;

  @IsOptional()
  @IsString()
  description?: string;
}
