import { IsString, Length, MaxLength, MinLength } from 'class-validator';

export class ForgotPasswordRequestDto {
  @IsString()
  phone: string;
}

export class ForgotPasswordVerifyDto {
  @IsString()
  phone: string;

  @IsString()
  @Length(4, 10)
  code: string;
}

export class ForgotPasswordResetDto {
  @IsString()
  resetToken: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword: string;
}
