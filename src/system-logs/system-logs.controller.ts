import {
  Controller,
  Delete,
  Get,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { SystemLogsService } from './system-logs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';
import { LogLevel } from './entities/system-log.entity';

interface RequestWithUser extends Request {
  user?: {
    userId: number;
    role: string;
  };
}

const ALLOWED_LEVELS: LogLevel[] = [
  LogLevel.INFO,
  LogLevel.WARN,
  LogLevel.ERROR,
  LogLevel.DEBUG,
];

function assertAdmin(req?: RequestWithUser): void {
  if (req?.user?.role !== 'admin') {
    throw new ForbiddenException('Only admins can manage system logs');
  }
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
    assertAdmin(req);

    return this.logsService.findAll({
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  /**
   * Admin cleanup:
   *  - `?olderThanHours=24` deletes info logs older than 24h
   *  - `?level=info` restricts to a single level
   *  - no filters = wipe everything
   */
  @UseGuards(JwtAuthGuard)
  @Delete()
  async clear(
    @Query('olderThanHours') olderThanHoursRaw?: string,
    @Query('level') levelRaw?: string,
    @Req() req?: RequestWithUser,
  ) {
    assertAdmin(req);

    let olderThanHours: number | undefined;
    if (olderThanHoursRaw != null && olderThanHoursRaw !== '') {
      const n = Number(olderThanHoursRaw);
      if (!Number.isFinite(n) || n < 0) {
        throw new BadRequestException('olderThanHours must be a positive number');
      }
      olderThanHours = n;
    }

    let level: LogLevel | undefined;
    if (levelRaw) {
      if (!ALLOWED_LEVELS.includes(levelRaw as LogLevel)) {
        throw new BadRequestException(
          `level must be one of: ${ALLOWED_LEVELS.join(', ')}`,
        );
      }
      level = levelRaw as LogLevel;
    }

    return this.logsService.clear({ olderThanHours, level });
  }
}
