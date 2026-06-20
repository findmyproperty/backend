import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { LoanRequestStatus } from '../entities/loan-request.entity';

export class UpdateLoanRequestDto {
  @IsOptional()
  @IsEnum(LoanRequestStatus)
  status?: LoanRequestStatus;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  internalNotes?: string;

  @IsOptional()
  @IsInt()
  assignedAdminId?: number | null;
}