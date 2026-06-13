import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RazorpayWebhookEvent } from './entities/razorpay-webhook-event.entity';

@Injectable()
export class RazorpayWebhookEventsService {
  constructor(
    @InjectRepository(RazorpayWebhookEvent)
    private readonly repo: Repository<RazorpayWebhookEvent>,
  ) {}

  async claim(input: {
    eventId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<{ event: RazorpayWebhookEvent; duplicate: boolean }> {
    const existing = await this.repo.findOne({
      where: { eventId: input.eventId },
    });
    if (existing) {
      return { event: existing, duplicate: existing.processed };
    }

    try {
      const event = await this.repo.save(
        this.repo.create({
          eventId: input.eventId,
          eventType: input.eventType,
          payload: input.payload,
          processed: false,
          error: null,
          processedAt: null,
        }),
      );
      return { event, duplicate: false };
    } catch {
      const event = await this.repo.findOneOrFail({
        where: { eventId: input.eventId },
      });
      return { event, duplicate: event.processed };
    }
  }

  async markProcessed(event: RazorpayWebhookEvent): Promise<void> {
    event.processed = true;
    event.error = null;
    event.processedAt = new Date();
    await this.repo.save(event);
  }

  async markFailed(event: RazorpayWebhookEvent, error: unknown): Promise<void> {
    event.processed = false;
    event.error = String(error).slice(0, 1000);
    await this.repo.save(event);
  }
}
