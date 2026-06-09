import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SupportTicketsService } from './support-tickets.service';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';

interface RequestWithUser extends Request {
  user?: { userId: number; role: string };
}

@Controller('support-tickets')
@UseGuards(JwtAuthGuard)
export class SupportTicketsController {
  constructor(private readonly service: SupportTicketsService) {}

  @Post()
  async create(
    @Req() req: RequestWithUser,
    @Body() dto: CreateSupportTicketDto,
  ) {
    const userId = req.user?.userId;
    const role = req.user?.role;
    if (!userId || !role) throw new ForbiddenException('Not authenticated');
    if (role !== 'vendor' && role !== 'tenant' && role !== 'agent') {
      throw new ForbiddenException('Role cannot create support tickets');
    }
    return this.service.create(userId, role, dto);
  }

  @Get('mine')
  async listMine(@Req() req: RequestWithUser) {
    const userId = req.user?.userId;
    if (!userId) throw new ForbiddenException('Not authenticated');
    return this.service.listMine(userId);
  }
}
