import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { JobConsultancyStatus } from '../entities/job-consultancy-request.entity';

export class UpdateJobConsultancyRequestDto {
  @IsOptional()
  @IsEnum(JobConsultancyStatus)
  status?: JobConsultancyStatus;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  internalNotes?: string;

  @IsOptional()
  @IsInt()
  assignedAdminId?: number | null;
}