import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ServiceRequestStatus } from '../entities/service-request.entity';

export class UpdateServiceRequestDto {
  @IsOptional()
  @IsEnum(ServiceRequestStatus)
  status?: ServiceRequestStatus;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  internalNotes?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  assignedAdminId?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  assignedVendorUserId?: number | null;
}
