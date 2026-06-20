import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  ValidateNested,
} from 'class-validator';

export const SERVICE_REQUEST_EMAIL_RECIPIENTS = [
  'customer',
  'vendor',
  'admin',
] as const;
export type ServiceRequestEmailRecipient =
  (typeof SERVICE_REQUEST_EMAIL_RECIPIENTS)[number];

export const SERVICE_REQUEST_EMAIL_EVENTS = [
  'status_changed',
  'completed',
  'vendor_assigned',
] as const;
export type ServiceRequestEmailEvent =
  (typeof SERVICE_REQUEST_EMAIL_EVENTS)[number];

export class ServiceRequestEmailNotificationsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(SERVICE_REQUEST_EMAIL_RECIPIENTS, { each: true })
  recipients!: ServiceRequestEmailRecipient[];

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(SERVICE_REQUEST_EMAIL_EVENTS, { each: true })
  events!: ServiceRequestEmailEvent[];
}