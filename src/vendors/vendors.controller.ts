import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VendorsService } from './vendors.service';
import { UpdateVendorMeDto } from './dto/update-vendor-me.dto';

interface RequestWithUser extends Request {
  user?: { userId: number; role: string };
}

@Controller('vendors')
@UseGuards(JwtAuthGuard)
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get('me')
  async getMe(@Req() req: RequestWithUser) {
    const userId = req.user?.userId;
    if (!userId) throw new ForbiddenException('Not authenticated');
    if (req.user?.role !== 'vendor') {
      throw new ForbiddenException('Only vendors can access this');
    }
    return this.vendorsService.getMe(userId);
  }

  @Patch('me')
  async updateMe(
    @Req() req: RequestWithUser,
    @Body() dto: UpdateVendorMeDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) throw new ForbiddenException('Not authenticated');
    if (req.user?.role !== 'vendor') {
      throw new ForbiddenException('Only vendors can access this');
    }
    return this.vendorsService.updateMe(userId, dto);
  }
}
