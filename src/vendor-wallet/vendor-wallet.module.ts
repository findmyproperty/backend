import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendorLedgerEntry } from './entities/vendor-ledger-entry.entity';
import { VendorWalletService } from './vendor-wallet.service';
import { VendorWalletController } from './vendor-wallet.controller';
import { VendorWalletAdminController } from './vendor-wallet.admin.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([VendorLedgerEntry]),
    SettingsModule,
  ],
  controllers: [VendorWalletController, VendorWalletAdminController],
  providers: [VendorWalletService],
  exports: [VendorWalletService],
})
export class VendorWalletModule {}
