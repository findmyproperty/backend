import { Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { MailService } from './mail.service';

export interface AdminBroadcastEmailInput {
  templateKey: string;
  feature: string;
  triggerEvent: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  entityType?: string;
  entityId?: number;
  metadata?: Record<string, unknown>;
  skippedReason?: string;
}

/**
 * Sends the same transactional email to every admin user with an email on file.
 */
@Injectable()
export class AdminMailNotifier {
  private readonly logger = new Logger(AdminMailNotifier.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly mail: MailService,
  ) {}

  notifyAllAdmins(input: AdminBroadcastEmailInput): void {
    void this.sendToAllAdmins(input).catch((err: unknown) => {
      this.logger.error(
        `Failed admin broadcast (${input.templateKey}): ${String(err)}`,
      );
    });
  }

  async sendToAllAdmins(input: AdminBroadcastEmailInput): Promise<void> {
    const admins = await this.usersService.findAllAdmins();

    if (admins.length === 0) {
      await this.mail.logSkipped({
        templateKey: input.templateKey,
        feature: input.feature,
        triggerEvent: input.triggerEvent,
        to: 'admins@none',
        subject: input.subject,
        skippedReason: input.skippedReason ?? 'no_admin_emails',
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata,
      });
      return;
    }

    for (const admin of admins) {
      if (!admin.email?.trim()) continue;
      await this.mail.send({
        templateKey: input.templateKey,
        feature: input.feature,
        triggerEvent: input.triggerEvent,
        to: admin.email,
        subject: input.subject,
        text: input.text,
        html: input.html,
        replyTo: input.replyTo,
        recipientUserId: admin.id,
        recipientRole: 'admin',
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata,
      });
    }
  }
}
