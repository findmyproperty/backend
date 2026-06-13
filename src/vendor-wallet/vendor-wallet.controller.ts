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
import { VendorWalletService } from './vendor-wallet.service';
import { ListLedgerQueryDto } from './dto/list-ledger.query.dto';
import { CreatePayoutAccountDto } from './dto/create-payout-account.dto';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { ListWithdrawalsQueryDto } from './dto/list-withdrawals.query.dto';

interface RequestWithUser extends Request {
  user?: { userId: number; role: string };
}

@Controller('vendor-wallet')
@UseGuards(JwtAuthGuard)
export class VendorWalletController {
  constructor(private readonly walletService: VendorWalletService) {}

  @Get('summary')
  async summary(@Req() req: RequestWithUser) {
    const userId = this.requireVendor(req);
    return this.walletService.getSummary(userId);
  }

  @Get('entries')
  async entries(
    @Req() req: RequestWithUser,
    @Query() query: ListLedgerQueryDto,
  ) {
    const userId = this.requireVendor(req);
    return this.walletService.listEntries(userId, query);
  }

  @Post('payout-accounts')
  async createPayoutAccount(
    @Req() req: RequestWithUser,
    @Body() dto: CreatePayoutAccountDto,
  ) {
    const userId = this.requireVendor(req);
    return this.walletService.createPayoutAccount(userId, dto);
  }

  @Get('payout-accounts')
  async payoutAccounts(@Req() req: RequestWithUser) {
    const userId = this.requireVendor(req);
    return this.walletService.listPayoutAccounts(userId);
  }

  @Post('withdrawals')
  async createWithdrawal(
    @Req() req: RequestWithUser,
    @Body() dto: CreateWithdrawalDto,
  ) {
    const userId = this.requireVendor(req);
    return this.walletService.createWithdrawal(userId, dto);
  }

  @Get('withdrawals')
  async withdrawals(
    @Req() req: RequestWithUser,
    @Query() query: ListWithdrawalsQueryDto,
  ) {
    const userId = this.requireVendor(req);
    return this.walletService.listWithdrawals(userId, query);
  }

  private requireVendor(req: RequestWithUser): number {
    const userId = req.user?.userId;
    if (!userId || req.user?.role !== 'vendor') {
      throw new ForbiddenException('Only vendors can access wallet');
    }
    return userId;
  }
}
