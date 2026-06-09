import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class AdminPayoutDto {
  @IsInt()
  @Min(1)
  vendorUserId: number;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;
}
