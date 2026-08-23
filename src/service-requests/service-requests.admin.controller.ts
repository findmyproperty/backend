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
import { ListServiceRequestsQueryDto } from './dto/list-service-requests.query.dto';
import { UpdateServiceRequestDto } from './dto/update-service-request.dto';
import { ServiceRequestsService } from './service-requests.service';

interface RequestWithUser extends Request {
  user?: {
    userId: number;
    role: string;
  };
}

function assertAdmin(req: RequestWithUser): void {
  if (req.user?.role !== 'admin') {
    throw new ForbiddenException('Only admins can manage service requests');
  }
}

@Controller('admin/service-requests')
export class ServiceRequestsAdminController {
  constructor(private readonly service: ServiceRequestsService) {}

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
    @Query() query: ListServiceRequestsQueryDto,
  ) {
    assertAdmin(req);
    return this.service.adminList(query);
  }

  @UseGuards(JwtAuthGuard)
  @Get('reactions')
  async reactions(@Req() req: RequestWithUser) {
    assertAdmin(req);
    return this.service.adminCustomerReactions();
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
    @Body() dto: UpdateServiceRequestDto,
  ) {
    assertAdmin(req);
    return this.service.adminUpdate(id, dto);
  }
}
