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
import { VendorsService } from './vendors.service';
import { ListVendorsQueryDto } from './dto/list-vendors.query.dto';
import { AdminUpdateVendorDto } from './dto/admin-update-vendor.dto';

interface RequestWithUser extends Request {
  user?: { userId: number; role: string };
}

function assertAdmin(req: RequestWithUser): void {
  if (req.user?.role !== 'admin') {
    throw new ForbiddenException('Only admins can manage vendors');
  }
}

@Controller('admin/vendors')
@UseGuards(JwtAuthGuard)
export class VendorsAdminController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get()
  async list(
    @Req() req: RequestWithUser,
    @Query() query: ListVendorsQueryDto,
  ) {
    assertAdmin(req);
    return this.vendorsService.adminList(query);
  }

  @Get('select')
  async select(@Req() req: RequestWithUser) {
    assertAdmin(req);
    return this.vendorsService.listVerifiedVendorsForSelect();
  }

  @Patch(':userId')
  async update(
    @Req() req: RequestWithUser,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: AdminUpdateVendorDto,
  ) {
    assertAdmin(req);
    return this.vendorsService.adminUpdate(userId, dto);
  }
}
