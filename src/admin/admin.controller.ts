import { Controller, Get, Req, ForbiddenException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AdminService } from './admin.service';
import type { Request } from 'express';

interface RequestWithUser extends Request {
  user?: {
    userId: number;
    role: string;
  };
}

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @UseGuards(JwtAuthGuard)
  @Get('dashboard-stats')
  async dashboardStats(@Req() req: RequestWithUser) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins can view dashboard stats');
    }
    return this.adminService.getDashboardStats();
  }
}
