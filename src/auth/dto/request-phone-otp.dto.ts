import { IsIn, IsOptional, IsString } from 'class-validator';

export class RequestPhoneOtpDto {
  @IsString()
  phone: string;

  /** `register` rejects phones that already have an account. Default `login`. */
  @IsOptional()
  @IsIn(['login', 'register'])
  intent?: 'login' | 'register';
}
