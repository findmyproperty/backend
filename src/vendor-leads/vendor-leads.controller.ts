import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VendorLeadsService } from './vendor-leads.service';
import { PatchVendorLeadDto } from './dto/patch-vendor-lead.dto';
import { CreateVendorLeadUpdateDto } from './dto/create-vendor-lead-update.dto';

interface RequestWithUser extends Request {
  user?: { userId: number; role: string };
}

@Controller('vendor-leads')
@UseGuards(JwtAuthGuard)
export class VendorLeadsController {
  constructor(private readonly service: VendorLeadsService) {}

  @Get()
  async list(@Req() req: RequestWithUser) {
    const userId = req.user?.userId;
    if (!userId || req.user?.role !== 'vendor') {
      throw new ForbiddenException('Only vendors can list vendor leads');
    }
    return this.service.findAllForVendor(userId);
  }

  @Get(':id')
  async findOne(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const userId = req.user?.userId;
    if (!userId || req.user?.role !== 'vendor') {
      throw new ForbiddenException('Only vendors');
    }
    return this.service.findOneForVendor(id, userId);
  }

  @Patch(':id')
  async patch(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PatchVendorLeadDto,
  ) {
    const userId = req.user?.userId;
    if (!userId || req.user?.role !== 'vendor') {
      throw new ForbiddenException('Only vendors');
    }
    return this.service.patchForVendor(id, userId, dto);
  }

  @Post(':id/updates')
  async addUpdate(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateVendorLeadUpdateDto,
  ) {
    const userId = req.user?.userId;
    if (!userId || req.user?.role !== 'vendor') {
      throw new ForbiddenException('Only vendors');
    }
    return this.service.addUpdate(id, userId, dto);
  }
}
