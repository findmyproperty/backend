import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VendorLeadsService } from './vendor-leads.service';
import { ListVendorLeadsQueryDto } from './dto/list-vendor-leads.query.dto';
import { AdminCreateVendorLeadDto } from './dto/admin-create-vendor-lead.dto';
import { AdminPatchVendorLeadDto } from './dto/admin-patch-vendor-lead.dto';
import { AdminApproveVendorLeadDto } from './dto/admin-approve-vendor-lead.dto';
import { AdminRejectVendorLeadDto } from './dto/admin-reject-vendor-lead.dto';
import { AdminReopenVendorLeadSettlementDto } from './dto/admin-reopen-vendor-lead-settlement.dto';

interface RequestWithUser extends Request {
  user?: { userId: number; role: string };
}

@Controller('admin/vendor-leads')
@UseGuards(JwtAuthGuard)
export class VendorLeadsAdminController {
  constructor(private readonly service: VendorLeadsService) {}

  @Get()
  async list(
    @Req() req: RequestWithUser,
    @Query() query: ListVendorLeadsQueryDto,
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins');
    }
    return this.service.adminList(query);
  }

  @Get(':id')
  async findOne(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins');
    }
    return this.service.adminFindOne(id);
  }

  @Post()
  async create(
    @Req() req: RequestWithUser,
    @Body() dto: AdminCreateVendorLeadDto,
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins');
    }
    return this.service.adminCreate(dto);
  }

  @Patch(':id')
  async patch(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminPatchVendorLeadDto,
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins');
    }
    return this.service.adminPatch(id, dto, req.user!.userId);
  }

  @Post(':id/approve')
  async approve(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminApproveVendorLeadDto,
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins');
    }
    return this.service.adminApproveLead(id, req.user!.userId, dto.notes);
  }

  @Post(':id/reject')
  async reject(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminRejectVendorLeadDto,
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins');
    }
    return this.service.adminRejectLead(id, req.user!.userId, dto.reason);
  }

  @Post(':id/reopen-settlement')
  async reopenSettlement(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminReopenVendorLeadSettlementDto,
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins');
    }
    return this.service.adminReopenSettlement(id, dto.reason, req.user!.userId);
  }
}
