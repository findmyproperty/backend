import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Notification,
  NotificationType,
} from './entities/notification.entity';

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
  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
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
    return this.map(saved);
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
