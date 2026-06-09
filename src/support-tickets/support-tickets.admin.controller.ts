import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SupportTicketsService } from './support-tickets.service';
import { ListSupportTicketsQueryDto } from './dto/list-support-tickets.query.dto';
import { AdminPatchSupportTicketDto } from './dto/admin-patch-support-ticket.dto';

interface RequestWithUser extends Request {
  user?: { userId: number; role: string };
}

@Controller('admin/support-tickets')
@UseGuards(JwtAuthGuard)
export class SupportTicketsAdminController {
  constructor(private readonly service: SupportTicketsService) {}

  @Get()
  async list(
    @Req() req: RequestWithUser,
    @Query() query: ListSupportTicketsQueryDto,
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins');
    }
    return this.service.adminList(query);
  }

  @Patch(':id')
  async patch(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminPatchSupportTicketDto,
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins');
    }
    return this.service.adminPatch(id, dto);
  }
}
