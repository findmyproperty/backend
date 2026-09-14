import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Notification,
  NotificationType,
} from './entities/notification.entity';
import {
  MobilePlatform,
  MobilePushDevice,
} from './entities/mobile-push-device.entity';

export interface NotificationResponse {
  id: number;
  userId: number;
  type: string;
  title: string;
  body: string;
  read: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
    @InjectRepository(MobilePushDevice)
    private readonly devices: Repository<MobilePushDevice>,
  ) {}

  async create(input: {
    userId: number;
    type: NotificationType;
    title: string;
    body: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<NotificationResponse> {
    const row = this.repo.create({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      metadata: input.metadata ?? null,
      read: false,
    });
    const saved = await this.repo.save(row);
    const response = this.map(saved);
    void this.dispatchPush(response).catch((error: unknown) => {
      this.logger.warn(
        `Unable to dispatch push notification #${saved.id}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    });
    return response;
  }

  async listForUser(userId: number, limit = 50): Promise<NotificationResponse[]> {
    const rows = await this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => this.map(r));
  }

  async unreadCount(userId: number): Promise<number> {
    return this.repo.count({ where: { userId, read: false } });
  }

  async markRead(id: number, userId: number): Promise<NotificationResponse> {
    const row = await this.repo.findOneBy({ id, userId });
    if (!row) {
      throw new NotFoundException('Notification not found');
    }
    row.read = true;
    const saved = await this.repo.save(row);
    return this.map(saved);
  }

  async markAllRead(userId: number): Promise<void> {
    await this.repo.update({ userId, read: false }, { read: true });
  }

  async registerDevice(
    userId: number,
    input: { token: string; platform: MobilePlatform },
  ) {
    const existing = await this.devices.findOneBy({ token: input.token });
    const device = existing
      ? Object.assign(existing, { userId, platform: input.platform })
      : this.devices.create({
          userId,
          token: input.token,
          platform: input.platform,
        });
    const saved = await this.devices.save(device);
    return {
      id: saved.id,
      token: saved.token,
      platform: saved.platform,
      updatedAt: saved.updatedAt,
    };
  }

  async unregisterDevice(userId: number, token: string): Promise<void> {
    await this.devices.delete({ userId, token });
  }

  private async dispatchPush(notification: NotificationResponse): Promise<void> {
    const devices = await this.devices.find({
      where: { userId: notification.userId },
    });
    if (devices.length === 0) return;

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        devices.map((device) => ({
          to: device.token,
          sound: 'default',
          title: notification.title,
          body: notification.body,
          data: {
            notificationId: notification.id,
            type: notification.type,
            metadata: notification.metadata,
          },
        })),
      ),
    });
    if (!response.ok) {
      throw new Error(`Expo Push API returned ${response.status}`);
    }

    const payload = (await response.json()) as {
      data?: Array<{ status?: string; details?: { error?: string } }>;
    };
    const invalidTokens = devices
      .filter(
        (_, index) =>
          payload.data?.[index]?.status === 'error' &&
          payload.data[index]?.details?.error === 'DeviceNotRegistered',
      )
      .map((device) => device.token);
    if (invalidTokens.length > 0) {
      await this.devices
        .createQueryBuilder()
        .delete()
        .where('token IN (:...invalidTokens)', { invalidTokens })
        .execute();
    }
  }

  private map(n: Notification): NotificationResponse {
    return {
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      read: n.read,
      metadata: n.metadata,
      createdAt: n.createdAt,
    };
  }
}
