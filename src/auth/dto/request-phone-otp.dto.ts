import { IsString } from 'class-validator';

export class RequestPhoneOtpDto {
  @IsString()
  phone: string;
}
