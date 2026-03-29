import {
  Controller,
  Get,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { SystemLogsService } from './system-logs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

interface RequestWithUser extends Request {
  user?: {
    userId: number;
    role: string;
  };
}

@Controller('system-logs')
export class SystemLogsController {
  constructor(private readonly logsService: SystemLogsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Req() req?: RequestWithUser,
  ) {
    if (req?.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins can access system logs');
    }

    return this.logsService.findAll({
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }
}
