import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RazorpayModule } from '../razorpay/razorpay.module';
import { AdminWalletController } from './admin-wallet.controller';
import { AdminWalletService } from './admin-wallet.service';
import { AdminWalletEntry } from './entities/admin-wallet-entry.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AdminWalletEntry]), RazorpayModule],
  controllers: [AdminWalletController],
  providers: [AdminWalletService],
  exports: [AdminWalletService],
})
export class AdminWalletModule {}
