import { IsOptional, IsString, Length } from 'class-validator';

export class VerifyPhoneOtpDto {
  @IsString()
  phone: string;

  @IsString()
  @Length(4, 10)
  code: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  role?: string;
}
