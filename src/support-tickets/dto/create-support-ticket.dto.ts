import { IsEnum, IsString, MaxLength } from 'class-validator';
import { SupportTicketCategory } from '../entities/support-ticket.entity';

export class CreateSupportTicketDto {
  @IsEnum(SupportTicketCategory)
  category: SupportTicketCategory;

  @IsString()
  @MaxLength(200)
  subject: string;

  @IsString()
  @MaxLength(4000)
  body: string;
}
