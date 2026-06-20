import { Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { escapeHtmlForEmail } from '../helper/escape-html';
import { BRAND_COLOR } from '../helper/email-theme';
import { MailService } from '../mail/mail.service';
import {
  JobConsultancyRequest,
  JobConsultancyStatus,
  JobConsultancyType,
} from './entities/job-consultancy-request.entity';

const TYPE_LABELS: Record<JobConsultancyType, string> = {
  [JobConsultancyType.IT]: 'IT',
  [JobConsultancyType.NON_IT]: 'Non IT',
  [JobConsultancyType.CUSTOMER_SUPPORT]: 'Customer Support',
};

const STATUS_LABELS: Record<JobConsultancyStatus, string> = {
  [JobConsultancyStatus.NEW]: 'New',
  [JobConsultancyStatus.CONTACTED]: 'Contacted',
  [JobConsultancyStatus.SCREENING]: 'Screening',
  [JobConsultancyStatus.INTERVIEW_SCHEDULED]: 'Interview scheduled',
  [JobConsultancyStatus.PLACED]: 'Placed',
  [JobConsultancyStatus.REJECTED]: 'Rejected',
  [JobConsultancyStatus.CANCELLED]: 'Cancelled',
};

@Injectable()
export class JobConsultancyNotifier {
  private readonly logger = new Logger(JobConsultancyNotifier.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly mail: MailService,
  ) {}

  notifyAdminsOfNewRequest(request: JobConsultancyRequest): void {
    void this.sendNewRequestEmail(request).catch((err: unknown) => {
      this.logger.error(
        `Failed to notify admins for job consultancy #${request.id}: ${String(err)}`,
      );
    });
    if (request.email) {
      void this.sendCustomerConfirmation(request).catch((err: unknown) => {
        this.logger.error(
          `Failed to confirm job consultancy #${request.id} to candidate: ${String(err)}`,
        );
      });
    }
  }

  notifyStatusChange(
    request: JobConsultancyRequest,
    previousStatus: JobConsultancyStatus,
  ): void {
    if (previousStatus === request.status) return;
    if (!request.email) return;
    void this.sendStatusChangeEmail(request, previousStatus).catch(
      (err: unknown) => {
        this.logger.error(
          `Failed to notify candidate for job consultancy #${request.id}: ${String(err)}`,
        );
      },
    );
  }

  private async sendNewRequestEmail(
    request: JobConsultancyRequest,
  ): Promise<void> {
    const admins = await this.usersService.findAllAdmins();
    const label = TYPE_LABELS[request.consultancyType] ?? request.consultancyType;
    const subject = `New Job Consultancy (${label}) — ${request.name}`;
    const notes = request.details?.notes?.trim();
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:560px">
        <h2 style="color:${BRAND_COLOR}">New job consultancy inquiry</h2>
        <p><strong>Type:</strong> ${escapeHtmlForEmail(label)}</p>
        <p><strong>Name:</strong> ${escapeHtmlForEmail(request.name)}</p>
        <p><strong>Phone:</strong> ${escapeHtmlForEmail(request.phone)}</p>
        ${request.email ? `<p><strong>Email:</strong> ${escapeHtmlForEmail(request.email)}</p>` : ''}
        <p><strong>City:</strong> ${escapeHtmlForEmail(request.city ?? '—')}</p>
        ${notes ? `<p><strong>Notes:</strong> ${escapeHtmlForEmail(notes)}</p>` : ''}
      </div>`;
    const text = [
      `New Job Consultancy (${label})`,
      `Name: ${request.name}`,
      `Phone: ${request.phone}`,
      request.email ? `Email: ${request.email}` : null,
      `City: ${request.city ?? '—'}`,
      notes ? `Notes: ${notes}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    if (admins.length === 0) {
      await this.mail.logSkipped({
        templateKey: 'job_consultancy.admin_new',
        feature: 'job_consultancy',
        triggerEvent: 'created',
        to: 'admins@none',
        subject,
        skippedReason: 'no_admin_emails',
        entityType: 'job_consultancy_request',
        entityId: request.id,
      });
      return;
    }

    for (const admin of admins) {
      if (!admin.email?.trim()) continue;
      await this.mail.send({
        templateKey: 'job_consultancy.admin_new',
        feature: 'job_consultancy',
        triggerEvent: 'created',
        to: admin.email,
        subject,
        text,
        html,
        replyTo: request.email ?? undefined,
        recipientUserId: admin.id,
        recipientRole: 'admin',
        entityType: 'job_consultancy_request',
        entityId: request.id,
      });
    }
  }

  private async sendCustomerConfirmation(
    request: JobConsultancyRequest,
  ): Promise<void> {
    const label = TYPE_LABELS[request.consultancyType] ?? request.consultancyType;
    const subject = `We received your ${label} job consultancy request`;
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:560px">
        <h2 style="color:${BRAND_COLOR}">Thank you</h2>
        <p>Hi ${escapeHtmlForEmail(request.name)},</p>
        <p>We received your <strong>${escapeHtmlForEmail(label)}</strong> job consultancy request. Our team will contact you shortly.</p>
      </div>`;
    const text = `Hi ${request.name},\n\nWe received your ${label} job consultancy request. Our team will contact you shortly.`;

    await this.mail.send({
      templateKey: 'job_consultancy.candidate_confirmation',
      feature: 'job_consultancy',
      triggerEvent: 'created',
      to: request.email!,
      subject,
      text,
      html,
      recipientRole: 'customer',
      entityType: 'job_consultancy_request',
      entityId: request.id,
    });
  }

  private async sendStatusChangeEmail(
    request: JobConsultancyRequest,
    previousStatus: JobConsultancyStatus,
  ): Promise<void> {
    const label = TYPE_LABELS[request.consultancyType] ?? request.consultancyType;
    const prev = STATUS_LABELS[previousStatus] ?? previousStatus;
    const next = STATUS_LABELS[request.status] ?? request.status;
    const subject = `Your job consultancy (${label}) — ${next}`;
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:560px">
        <h2 style="color:${BRAND_COLOR}">Job consultancy update</h2>
        <p>Hi ${escapeHtmlForEmail(request.name)},</p>
        <p>Your <strong>${escapeHtmlForEmail(label)}</strong> application status changed from <strong>${escapeHtmlForEmail(prev)}</strong> to <strong>${escapeHtmlForEmail(next)}</strong>.</p>
        <p>Our team will reach out if any action is needed from your side.</p>
      </div>`;
    const text = `Hi ${request.name},\n\nYour ${label} job consultancy status changed from ${prev} to ${next}.\n\nOur team will reach out if any action is needed.`;

    await this.mail.send({
      templateKey: 'job_consultancy.candidate_status',
      feature: 'job_consultancy',
      triggerEvent: 'status_changed',
      to: request.email!,
      subject,
      text,
      html,
      recipientRole: 'customer',
      entityType: 'job_consultancy_request',
      entityId: request.id,
      metadata: { previousStatus, nextStatus: request.status },
    });
  }
}