import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { EmailLogStatus } from '../entities/email-log.entity';

export class ListEmailLogsQueryDto {
  @IsOptional()
  @IsString()
  feature?: string;

  @IsOptional()
  @IsEnum(EmailLogStatus)
  status?: EmailLogStatus;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}