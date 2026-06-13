import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { AdminWalletService } from '../admin-wallet/admin-wallet.service';
import { RazorpayWebhookEventsService } from '../razorpay/razorpay-webhook-events.service';
import { RazorpayService } from '../razorpay/razorpay.service';
import { VendorWalletService } from '../vendor-wallet/vendor-wallet.service';

interface RazorpayWebhookPayload {
  id?: string;
  event?: string;
  payload?: Record<string, { entity?: Record<string, unknown> }>;
}

@Controller('payments/razorpay')
export class RazorpayWebhookController {
  constructor(
    private readonly razorpayService: RazorpayService,
    private readonly webhookEvents: RazorpayWebhookEventsService,
    private readonly adminWalletService: AdminWalletService,
    private readonly vendorWalletService: VendorWalletService,
  ) {}

  @Post('webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature?: string,
    @Headers('x-razorpay-event-id') headerEventId?: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Raw webhook body is required.');
    }
    if (!signature) {
      throw new UnauthorizedException('Missing Razorpay signature.');
    }
    if (!this.razorpayService.verifyWebhookSignature(rawBody, signature)) {
      throw new UnauthorizedException('Invalid Razorpay signature.');
    }

    const payload = this.getPayload(req, rawBody);
    const eventType = payload.event;
    if (!eventType) {
      throw new BadRequestException('Razorpay webhook event is missing.');
    }

    const eventId = headerEventId || payload.id;
    if (!eventId) {
      throw new BadRequestException('Razorpay webhook event id is missing.');
    }

    const { event, duplicate } = await this.webhookEvents.claim({
      eventId,
      eventType,
      payload: payload as Record<string, unknown>,
    });
    if (duplicate) {
      return { received: true, duplicate: true };
    }

    try {
      await this.dispatch(eventType, payload, eventId);
      await this.webhookEvents.markProcessed(event);
      return { received: true };
    } catch (error) {
      await this.webhookEvents.markFailed(event, error);
      throw error;
    }
  }

  private async dispatch(
    eventType: string,
    payload: RazorpayWebhookPayload,
    eventId: string,
  ): Promise<void> {
    if (eventType === 'payment.captured') {
      const payment = this.getEntity(payload, 'payment');
      await this.adminWalletService.handlePaymentCaptured(payment, eventId);
      return;
    }

    if (eventType === 'order.paid') {
      const order = this.getEntity(payload, 'order');
      await this.adminWalletService.handleOrderPaid(order, eventId);
      return;
    }

    if (eventType.startsWith('payout.')) {
      const payout = this.getEntity(payload, 'payout');
      await this.vendorWalletService.handlePayoutWebhook(payout, eventId);
    }
  }

  private getPayload(
    req: RawBodyRequest<Request>,
    rawBody: Buffer,
  ): RazorpayWebhookPayload {
    if (
      req.body &&
      typeof req.body === 'object' &&
      !Buffer.isBuffer(req.body)
    ) {
      return req.body as RazorpayWebhookPayload;
    }

    try {
      return JSON.parse(rawBody.toString('utf8')) as RazorpayWebhookPayload;
    } catch {
      throw new BadRequestException('Invalid Razorpay webhook JSON.');
    }
  }

  private getEntity(
    payload: RazorpayWebhookPayload,
    key: string,
  ): Record<string, unknown> {
    const entity = payload.payload?.[key]?.entity;
    if (!entity || typeof entity !== 'object') {
      throw new BadRequestException(`Razorpay ${key} entity is missing.`);
    }
    return entity;
  }
}
