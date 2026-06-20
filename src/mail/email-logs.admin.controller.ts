import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ListEmailLogsQueryDto } from './dto/list-email-logs.query.dto';
import { EmailLogsService } from './email-logs.service';

interface RequestWithUser extends Request {
  user?: {
    userId: number;
    role: string;
  };
}

@Controller('admin/email-logs')
@UseGuards(JwtAuthGuard)
export class EmailLogsAdminController {
  constructor(private readonly service: EmailLogsService) {}

  @Get()
  async list(
    @Req() req: RequestWithUser,
    @Query() query: ListEmailLogsQueryDto,
  ) {
    this.assertAdmin(req);
    return this.service.adminList(query);
  }

  @Get(':id')
  async findOne(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    this.assertAdmin(req);
    return this.service.adminFindOne(id);
  }

  @Post(':id/resend')
  async resend(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    this.assertAdmin(req);
    return this.service.adminResend(id, req.user?.userId);
  }

  private assertAdmin(req: RequestWithUser) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Admin only');
    }
  }
}