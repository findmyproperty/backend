import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import nodemailer from 'nodemailer';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import {
  EmailLog,
  EmailLogStatus,
} from './entities/email-log.entity';

interface MailTransporter {
  sendMail(
    options: nodemailer.SendMailOptions,
  ): Promise<nodemailer.SentMessageInfo>;
}

export interface SendMailInput {
  templateKey: string;
  feature: string;
  triggerEvent: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  recipientUserId?: number | null;
  recipientRole?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  triggeredByUserId?: number | null;
  metadata?: Record<string, unknown> | null;
  resentFromId?: number | null;
  createAlert?: boolean;
}

export interface SkipMailInput {
  templateKey: string;
  feature: string;
  triggerEvent: string;
  to: string;
  subject: string;
  skippedReason: string;
  recipientUserId?: number | null;
  recipientRole?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  triggeredByUserId?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface EmailLogResponse {
  id: number;
  templateKey: string;
  feature: string;
  triggerEvent: string;
  recipientEmail: string;
  recipientUserId: number | null;
  recipientRole: string | null;
  subject: string;
  fromAddress: string;
  replyTo: string | null;
  entityType: string | null;
  entityId: number | null;
  status: EmailLogStatus;
  skippedReason: string | null;
  providerMessageId: string | null;
  errorMessage: string | null;
  attemptCount: number;
  resendCount: number;
  resentFromId: number | null;
  triggeredByUserId: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  sentAt: Date | null;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private mailTransporter: MailTransporter | null = null;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(EmailLog)
    private readonly emailLogRepo: Repository<EmailLog>,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async send(input: SendMailInput): Promise<EmailLogResponse> {
    const to = input.to.trim();
    const from = this.configService.get<string>('SMTP_FROM')?.trim();
    if (!from) {
      return this.logSkipped({
        templateKey: input.templateKey,
        feature: input.feature,
        triggerEvent: input.triggerEvent,
        to,
        subject: input.subject,
        skippedReason: 'smtp_from_not_configured',
        recipientUserId: input.recipientUserId,
        recipientRole: input.recipientRole,
        entityType: input.entityType,
        entityId: input.entityId,
        triggeredByUserId: input.triggeredByUserId,
        metadata: input.metadata,
      });
    }

    const transporter = this.getMailTransporter();
    if (!transporter) {
      return this.logSkipped({
        templateKey: input.templateKey,
        feature: input.feature,
        triggerEvent: input.triggerEvent,
        to,
        subject: input.subject,
        skippedReason: 'smtp_not_configured',
        recipientUserId: input.recipientUserId,
        recipientRole: input.recipientRole,
        entityType: input.entityType,
        entityId: input.entityId,
        triggeredByUserId: input.triggeredByUserId,
        metadata: input.metadata,
      });
    }

    const row = this.emailLogRepo.create({
      templateKey: input.templateKey,
      feature: input.feature,
      triggerEvent: input.triggerEvent,
      recipientEmail: to,
      recipientUserId: input.recipientUserId ?? null,
      recipientRole: input.recipientRole ?? null,
      subject: input.subject,
      fromAddress: from,
      replyTo: input.replyTo?.trim() || null,
      textBody: input.text ?? null,
      htmlBody: input.html ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      status: EmailLogStatus.QUEUED,
      attemptCount: 1,
      resentFromId: input.resentFromId ?? null,
      triggeredByUserId: input.triggeredByUserId ?? null,
      metadata: input.metadata ?? null,
    });
    const saved = await this.emailLogRepo.save(row);

    try {
      const info = await transporter.sendMail({
        from,
        to,
        replyTo: input.replyTo,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });
      saved.status = EmailLogStatus.SENT;
      saved.providerMessageId =
        typeof info.messageId === 'string' ? info.messageId : null;
      saved.sentAt = new Date();
      const updated = await this.emailLogRepo.save(saved);

      if (input.resentFromId) {
        await this.emailLogRepo.increment(
          { id: input.resentFromId },
          'resendCount',
          1,
        );
      }

      if (input.createAlert !== false) {
        await this.createRecipientAlert(updated);
      }

      return this.map(updated);
    } catch (error) {
      saved.status = EmailLogStatus.FAILED;
      saved.errorMessage =
        error instanceof Error ? error.message : String(error);
      const updated = await this.emailLogRepo.save(saved);
      this.logger.error(
        `Email ${input.templateKey} to ${to} failed: ${saved.errorMessage}`,
      );
      return this.map(updated);
    }
  }

  async logSkipped(input: SkipMailInput): Promise<EmailLogResponse> {
    const from =
      this.configService.get<string>('SMTP_FROM')?.trim() ?? 'not-configured';
    const row = this.emailLogRepo.create({
      templateKey: input.templateKey,
      feature: input.feature,
      triggerEvent: input.triggerEvent,
      recipientEmail: input.to.trim(),
      recipientUserId: input.recipientUserId ?? null,
      recipientRole: input.recipientRole ?? null,
      subject: input.subject,
      fromAddress: from,
      replyTo: null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      status: EmailLogStatus.SKIPPED,
      skippedReason: input.skippedReason,
      attemptCount: 0,
      triggeredByUserId: input.triggeredByUserId ?? null,
      metadata: input.metadata ?? null,
    });
    const saved = await this.emailLogRepo.save(row);
    this.logger.warn(
      `Skipped email ${input.templateKey} to ${input.to}: ${input.skippedReason}`,
    );
    return this.map(saved);
  }

  async resend(id: number, triggeredByUserId?: number): Promise<EmailLogResponse> {
    const original = await this.emailLogRepo.findOneBy({ id });
    if (!original) {
      throw new Error(`Email log ${id} not found`);
    }

    return this.send({
      templateKey: original.templateKey,
      feature: original.feature,
      triggerEvent: original.triggerEvent,
      to: original.recipientEmail,
      subject: original.subject,
      text: original.textBody ?? undefined,
      html: original.htmlBody ?? undefined,
      replyTo: original.replyTo ?? undefined,
      recipientUserId: original.recipientUserId,
      recipientRole: original.recipientRole,
      entityType: original.entityType,
      entityId: original.entityId,
      triggeredByUserId: triggeredByUserId ?? null,
      metadata: {
        ...(original.metadata ?? {}),
        resentFromId: original.id,
      },
      resentFromId: original.id,
    });
  }

  map(row: EmailLog): EmailLogResponse {
    return {
      id: row.id,
      templateKey: row.templateKey,
      feature: row.feature,
      triggerEvent: row.triggerEvent,
      recipientEmail: row.recipientEmail,
      recipientUserId: row.recipientUserId,
      recipientRole: row.recipientRole,
      subject: row.subject,
      fromAddress: row.fromAddress,
      replyTo: row.replyTo,
      entityType: row.entityType,
      entityId: row.entityId,
      status: row.status,
      skippedReason: row.skippedReason,
      providerMessageId: row.providerMessageId,
      errorMessage: row.errorMessage,
      attemptCount: row.attemptCount,
      resendCount: row.resendCount,
      resentFromId: row.resentFromId,
      triggeredByUserId: row.triggeredByUserId,
      metadata: row.metadata,
      createdAt: row.createdAt,
      sentAt: row.sentAt,
    };
  }

  private async createRecipientAlert(log: EmailLog): Promise<void> {
    let userId = log.recipientUserId;
    if (!userId) {
      const user = await this.usersService.findByEmail(log.recipientEmail);
      userId = user?.id ?? null;
    }
    if (!userId) return;

    await this.notificationsService.create({
      userId,
      type: NotificationType.EMAIL_RECEIVED,
      title: log.subject,
      body: `${this.formatFeatureLabel(log.feature)} — ${this.formatTriggerLabel(log.triggerEvent)}`,
      metadata: {
        emailLogId: log.id,
        feature: log.feature,
        triggerEvent: log.triggerEvent,
        entityType: log.entityType,
        entityId: log.entityId,
        status: log.status,
      },
    });
  }

  private formatFeatureLabel(feature: string): string {
    return feature.replace(/_/g, ' ');
  }

  private formatTriggerLabel(trigger: string): string {
    return trigger.replace(/_/g, ' ');
  }

  private getMailTransporter(): MailTransporter | null {
    if (this.mailTransporter) return this.mailTransporter;
    const host = this.configService.get<string>('SMTP_HOST');
    const port = Number(this.configService.get<string>('SMTP_PORT') || 0);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    if (!host || !port) return null;

    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
    this.mailTransporter = transport as MailTransporter;
    return this.mailTransporter;
  }
}