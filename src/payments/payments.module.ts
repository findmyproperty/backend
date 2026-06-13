import { Module } from '@nestjs/common';
import { AdminWalletModule } from '../admin-wallet/admin-wallet.module';
import { RazorpayModule } from '../razorpay/razorpay.module';
import { VendorWalletModule } from '../vendor-wallet/vendor-wallet.module';
import { RazorpayWebhookController } from './razorpay-webhook.controller';

@Module({
  imports: [RazorpayModule, AdminWalletModule, VendorWalletModule],
  controllers: [RazorpayWebhookController],
})
export class PaymentsModule {}
