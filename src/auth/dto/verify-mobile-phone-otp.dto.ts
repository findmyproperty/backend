import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { UserRole } from 'src/users/entities/user.entity';

/** Native sign-in deliberately exposes only roles that may self-register. */
export class VerifyMobilePhoneOtpDto {
  @IsString()
  phone: string;

  @IsString()
  @Length(4, 10)
  code: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum([UserRole.TENANT, UserRole.VENDOR])
  @IsOptional()
  registrationRole?: UserRole.TENANT | UserRole.VENDOR;
}
