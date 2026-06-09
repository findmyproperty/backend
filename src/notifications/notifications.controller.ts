import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

interface RequestWithUser extends Request {
  user?: { userId: number; role: string };
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  async list(@Req() req: RequestWithUser) {
    const userId = req.user?.userId;
    if (!userId) throw new ForbiddenException('Not authenticated');
    return this.service.listForUser(userId);
  }

  @Get('unread-count')
  async unreadCount(@Req() req: RequestWithUser) {
    const userId = req.user?.userId;
    if (!userId) throw new ForbiddenException('Not authenticated');
    const count = await this.service.unreadCount(userId);
    return { count };
  }

  @Patch('read-all')
  async markAllRead(@Req() req: RequestWithUser) {
    const userId = req.user?.userId;
    if (!userId) throw new ForbiddenException('Not authenticated');
    await this.service.markAllRead(userId);
    return { ok: true };
  }

  @Patch(':id/read')
  async markRead(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const userId = req.user?.userId;
    if (!userId) throw new ForbiddenException('Not authenticated');
    return this.service.markRead(id, userId);
  }
}
