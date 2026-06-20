import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VendorWalletService } from './vendor-wallet.service';
import { ListLedgerQueryDto } from './dto/list-ledger.query.dto';
import { AdminPayoutDto } from './dto/admin-payout.dto';
import { AdminCreatePayoutDto } from './dto/admin-create-payout.dto';
import { AdminCreditWalletDto } from './dto/admin-credit-wallet.dto';

interface RequestWithUser extends Request {
  user?: { userId: number; role: string };
}

@Controller('admin/vendor-wallet')
@UseGuards(JwtAuthGuard)
export class VendorWalletAdminController {
  constructor(private readonly walletService: VendorWalletService) {}

  @Get(':vendorUserId/summary')
  async summary(
    @Req() req: RequestWithUser,
    @Param('vendorUserId', ParseIntPipe) vendorUserId: number,
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins');
    }
    return this.walletService.getSummary(vendorUserId);
  }

  @Get(':vendorUserId/entries')
  async entries(
    @Req() req: RequestWithUser,
    @Param('vendorUserId', ParseIntPipe) vendorUserId: number,
    @Query() query: ListLedgerQueryDto,
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins');
    }
    return this.walletService.listEntries(vendorUserId, query);
  }

  @Get(':vendorUserId/payout-accounts')
  async payoutAccounts(
    @Req() req: RequestWithUser,
    @Param('vendorUserId', ParseIntPipe) vendorUserId: number,
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins');
    }
    return this.walletService.listPayoutAccounts(vendorUserId);
  }

  @Post('payout')
  async payout(@Req() req: RequestWithUser, @Body() dto: AdminPayoutDto) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins');
    }
    return this.walletService.adminRecordPayout(dto);
  }

  @Post('payouts')
  async createPayout(
    @Req() req: RequestWithUser,
    @Body() dto: AdminCreatePayoutDto,
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins');
    }
    return this.walletService.adminCreatePayout(dto);
  }

  @Post('credits')
  async creditWallet(
    @Req() req: RequestWithUser,
    @Body() dto: AdminCreditWalletDto,
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins');
    }
    return this.walletService.adminCreditWallet(dto);
  }
}
