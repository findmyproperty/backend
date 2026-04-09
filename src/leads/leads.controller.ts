import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { LeadsService } from './leads.service';

interface RequestWithUser extends Request {
  user?: {
    userId: number;
    role: string;
  };
}

@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: RequestWithUser, @Body() dto: CreateLeadDto) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new ForbiddenException('User not authenticated properly');
    }
    if (req.user?.role !== 'tenant') {
      throw new ForbiddenException('Only tenants can create enquiries');
    }
    return this.leadsService.create(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@Req() req: RequestWithUser) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new ForbiddenException('User not authenticated properly');
    }
    if (req.user?.role !== 'agent') {
      throw new ForbiddenException('Only agents can list leads');
    }
    return this.leadsService.findAllForAgent(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async updateStatus(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLeadStatusDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new ForbiddenException('User not authenticated properly');
    }
    if (req.user?.role !== 'agent') {
      throw new ForbiddenException('Only agents can update lead status');
    }
    return this.leadsService.updateStatus(id, userId, dto);
  }
}
