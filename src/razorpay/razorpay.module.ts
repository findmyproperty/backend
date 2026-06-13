import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RazorpayWebhookEvent } from './entities/razorpay-webhook-event.entity';
import { RazorpayService } from './razorpay.service';
import { RazorpayWebhookEventsService } from './razorpay-webhook-events.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([RazorpayWebhookEvent])],
  providers: [RazorpayService, RazorpayWebhookEventsService],
  exports: [RazorpayService, RazorpayWebhookEventsService],
})
export class RazorpayModule {}
