import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendorLedgerEntry } from './entities/vendor-ledger-entry.entity';
import { VendorPayoutAccount } from './entities/vendor-payout-account.entity';
import { VendorWithdrawal } from './entities/vendor-withdrawal.entity';
import { VendorWalletService } from './vendor-wallet.service';
import { VendorWalletController } from './vendor-wallet.controller';
import { VendorWalletAdminController } from './vendor-wallet.admin.controller';
import { SettingsModule } from '../settings/settings.module';
import { UsersModule } from '../users/users.module';
import { RazorpayModule } from '../razorpay/razorpay.module';
import { AdminWalletModule } from '../admin-wallet/admin-wallet.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VendorLedgerEntry,
      VendorPayoutAccount,
      VendorWithdrawal,
    ]),
    SettingsModule,
    UsersModule,
    RazorpayModule,
    AdminWalletModule,
  ],
  controllers: [VendorWalletController, VendorWalletAdminController],
  providers: [VendorWalletService],
  exports: [VendorWalletService],
})
export class VendorWalletModule {}
