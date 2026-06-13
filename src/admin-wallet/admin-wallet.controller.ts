import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminWalletService } from './admin-wallet.service';
import { CreateAdminTopUpDto } from './dto/create-admin-top-up.dto';
import { ListAdminWalletEntriesQueryDto } from './dto/list-admin-wallet-entries.query.dto';

interface RequestWithUser extends Request {
  user?: { userId: number; role: string };
}

@Controller('admin/e-wallet')
@UseGuards(JwtAuthGuard)
export class AdminWalletController {
  constructor(private readonly adminWalletService: AdminWalletService) {}

  @Post('top-ups')
  async createTopUp(
    @Req() req: RequestWithUser,
    @Body() dto: CreateAdminTopUpDto,
  ) {
    const adminUserId = this.requireAdmin(req);
    return this.adminWalletService.createTopUp(adminUserId, dto);
  }

  @Get('summary')
  async summary(@Req() req: RequestWithUser) {
    this.requireAdmin(req);
    return this.adminWalletService.getSummary();
  }

  @Get('entries')
  async entries(
    @Req() req: RequestWithUser,
    @Query() query: ListAdminWalletEntriesQueryDto,
  ) {
    this.requireAdmin(req);
    return this.adminWalletService.listEntries(query);
  }

  private requireAdmin(req: RequestWithUser): number {
    if (!req.user?.userId || req.user.role !== 'admin') {
      throw new ForbiddenException('Only admins');
    }
    return req.user.userId;
  }
}
