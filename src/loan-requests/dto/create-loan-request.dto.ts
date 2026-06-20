import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LoanType } from '../entities/loan-request.entity';

export class LoanRequestDetailsDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateLoanRequestDto {
  @IsEnum(LoanType)
  loanType: LoanType;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsString()
  @Matches(/^\+?[0-9\s\-()]{7,20}$/, {
    message: 'Phone must be a valid phone number.',
  })
  @MaxLength(32)
  phone: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ValidateNested()
  @Type(() => LoanRequestDetailsDto)
  details: LoanRequestDetailsDto;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  recaptchaToken?: string;
}