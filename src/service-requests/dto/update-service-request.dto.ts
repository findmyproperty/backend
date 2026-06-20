import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ServiceRequestStatus } from '../entities/service-request.entity';
import { ServiceRequestEmailNotificationsDto } from './service-request-email-notifications.dto';

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

  @IsOptional()
  @ValidateNested()
  @Type(() => ServiceRequestEmailNotificationsDto)
  emailNotifications?: ServiceRequestEmailNotificationsDto;
}
