import { IsEmail, IsString, Length } from 'class-validator';

export class VerifyEmailOtpDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(4, 8)
  code: string;
}
