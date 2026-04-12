import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ContactService } from './contact.service';
import { CreateContactDto } from './dto/create-contact.dto';

@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  /** Stricter than global default: 5 submissions per 15 minutes per IP. */
  @Throttle({
    default: { limit: 5, ttl: 900_000 },
  })
  @Post()
  submit(@Body() dto: CreateContactDto) {
    return this.contactService.sendToAdmins(dto);
  }
}
