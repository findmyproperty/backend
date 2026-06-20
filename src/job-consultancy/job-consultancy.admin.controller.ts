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
import { ListJobConsultancyRequestsQueryDto } from './dto/list-job-consultancy-requests.query.dto';
import { UpdateJobConsultancyRequestDto } from './dto/update-job-consultancy-request.dto';
import { JobConsultancyService } from './job-consultancy.service';

interface RequestWithUser extends Request {
  user?: {
    userId: number;
    role: string;
  };
}

function assertAdmin(req: RequestWithUser): void {
  if (req.user?.role !== 'admin') {
    throw new ForbiddenException('Only admins can manage job consultancy requests');
  }
}

@Controller('admin/job-consultancy')
export class JobConsultancyAdminController {
  constructor(private readonly service: JobConsultancyService) {}

  @UseGuards(JwtAuthGuard)
  @Get('stats')
  async stats(@Req() req: RequestWithUser) {
    assertAdmin(req);
    return this.service.adminStats();
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(
    @Req() req: RequestWithUser,
    @Query() query: ListJobConsultancyRequestsQueryDto,
  ) {
    assertAdmin(req);
    return this.service.adminList(query);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findOne(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    assertAdmin(req);
    return this.service.adminFindOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateJobConsultancyRequestDto,
  ) {
    assertAdmin(req);
    return this.service.adminUpdate(id, dto);
  }
}