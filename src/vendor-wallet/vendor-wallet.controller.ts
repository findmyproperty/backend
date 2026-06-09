import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VendorWalletService } from './vendor-wallet.service';
import { ListLedgerQueryDto } from './dto/list-ledger.query.dto';

interface RequestWithUser extends Request {
  user?: { userId: number; role: string };
}

@Controller('vendor-wallet')
@UseGuards(JwtAuthGuard)
export class VendorWalletController {
  constructor(private readonly walletService: VendorWalletService) {}

  @Get('summary')
  async summary(@Req() req: RequestWithUser) {
    const userId = req.user?.userId;
    if (!userId || req.user?.role !== 'vendor') {
      throw new ForbiddenException('Only vendors can access wallet');
    }
    return this.walletService.getSummary(userId);
  }

  @Get('entries')
  async entries(
    @Req() req: RequestWithUser,
    @Query() query: ListLedgerQueryDto,
  ) {
    const userId = req.user?.userId;
    if (!userId || req.user?.role !== 'vendor') {
      throw new ForbiddenException('Only vendors can access wallet');
    }
    return this.walletService.listEntries(userId, query);
  }
}
