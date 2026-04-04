import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { UserRole } from 'src/users/entities/user.entity';

export class VerifyPhoneOtpDto {
  @IsString()
  phone: string;

  @IsString()
  @Length(4, 10)
  code: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole = UserRole.TENANT;
}
