import {
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';
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

  /** `register` rejects phones that already have an account. Default `login`. */
  @IsOptional()
  @IsIn(['login', 'register'])
  intent?: 'login' | 'register';

  /** Vendor signup only — applied when creating/updating the partner profile. */
  @IsOptional()
  @IsString()
  businessName?: string;

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  categoryIds?: number[];
}
