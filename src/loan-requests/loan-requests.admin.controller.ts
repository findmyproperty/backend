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
import { ListLoanRequestsQueryDto } from './dto/list-loan-requests.query.dto';
import { UpdateLoanRequestDto } from './dto/update-loan-request.dto';
import { LoanRequestsService } from './loan-requests.service';

interface RequestWithUser extends Request {
  user?: {
    userId: number;
    role: string;
  };
}

function assertAdmin(req: RequestWithUser): void {
  if (req.user?.role !== 'admin') {
    throw new ForbiddenException('Only admins can manage loan requests');
  }
}

@Controller('admin/loan-requests')
export class LoanRequestsAdminController {
  constructor(private readonly service: LoanRequestsService) {}

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
    @Query() query: ListLoanRequestsQueryDto,
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
    @Body() dto: UpdateLoanRequestDto,
  ) {
    assertAdmin(req);
    return this.service.adminUpdate(id, dto);
  }
}