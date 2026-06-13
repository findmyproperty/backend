import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export enum AdminTopUpMethod {
  UPI = 'upi',
  QR = 'qr',
  CARD = 'card',
  NETBANKING = 'netbanking',
}

export class CreateAdminTopUpDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsEnum(AdminTopUpMethod)
  method?: AdminTopUpMethod;

  @IsOptional()
  @IsString()
  description?: string;
}
