import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  JobConsultancyStatus,
  JobConsultancyType,
} from '../entities/job-consultancy-request.entity';

export class ListJobConsultancyRequestsQueryDto {
  @IsOptional()
  @IsEnum(JobConsultancyType)
  consultancyType?: JobConsultancyType;

  @IsOptional()
  @IsEnum(JobConsultancyStatus)
  status?: JobConsultancyStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}