import { IsEnum } from 'class-validator';
import { LeadStatus } from '../entities/property-lead.entity';

export class UpdateLeadStatusDto {
  @IsEnum(LeadStatus)
  status: LeadStatus;
}
