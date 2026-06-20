import { Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { escapeHtmlForEmail } from '../helper/escape-html';
import { BRAND_COLOR } from '../helper/email-theme';
import { MailService } from '../mail/mail.service';
import {
  LoanRequest,
  LoanRequestStatus,
  LoanType,
} from './entities/loan-request.entity';

const LOAN_LABELS: Record<LoanType, string> = {
  [LoanType.HOME_LOAN]: 'Home Loan',
  [LoanType.PERSONAL_LOAN]: 'Personal Loan',
  [LoanType.VEHICLE_LOAN]: 'Vehicle Loan',
  [LoanType.MORTGAGE]: 'Mortgage',
};

const STATUS_LABELS: Record<LoanRequestStatus, string> = {
  [LoanRequestStatus.NEW]: 'New',
  [LoanRequestStatus.CONTACTED]: 'Contacted',
  [LoanRequestStatus.DOCUMENTS_PENDING]: 'Documents pending',
  [LoanRequestStatus.UNDER_REVIEW]: 'Under review',
  [LoanRequestStatus.APPROVED]: 'Approved',
  [LoanRequestStatus.DISBURSED]: 'Disbursed',
  [LoanRequestStatus.REJECTED]: 'Rejected',
  [LoanRequestStatus.CANCELLED]: 'Cancelled',
};

@Injectable()
export class LoanRequestsNotifier {
  private readonly logger = new Logger(LoanRequestsNotifier.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly mail: MailService,
  ) {}

  notifyAdminsOfNewRequest(request: LoanRequest): void {
    void this.sendNewRequestEmail(request).catch((err: unknown) => {
      this.logger.error(
        `Failed to notify admins for loan request #${request.id}: ${String(err)}`,
      );
    });
    if (request.email) {
      void this.sendCustomerConfirmation(request).catch((err: unknown) => {
        this.logger.error(
          `Failed to confirm loan request #${request.id} to customer: ${String(err)}`,
        );
      });
    }
  }

  notifyStatusChange(
    request: LoanRequest,
    previousStatus: LoanRequestStatus,
  ): void {
    if (previousStatus === request.status) return;
    if (!request.email) return;
    void this.sendStatusChangeEmail(request, previousStatus).catch(
      (err: unknown) => {
        this.logger.error(
          `Failed to notify customer for loan request #${request.id}: ${String(err)}`,
        );
      },
    );
  }

  private async sendNewRequestEmail(request: LoanRequest): Promise<void> {
    const admins = await this.usersService.findAllAdmins();
    const label = LOAN_LABELS[request.loanType] ?? request.loanType;
    const subject = `New ${label} inquiry — ${request.name}`;
    const notes = request.details?.notes?.trim();
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:560px">
        <h2 style="color:${BRAND_COLOR}">New loan inquiry</h2>
        <p><strong>Type:</strong> ${escapeHtmlForEmail(label)}</p>
        <p><strong>Name:</strong> ${escapeHtmlForEmail(request.name)}</p>
        <p><strong>Phone:</strong> ${escapeHtmlForEmail(request.phone)}</p>
        ${request.email ? `<p><strong>Email:</strong> ${escapeHtmlForEmail(request.email)}</p>` : ''}
        <p><strong>City:</strong> ${escapeHtmlForEmail(request.city ?? '—')}</p>
        ${notes ? `<p><strong>Notes:</strong> ${escapeHtmlForEmail(notes)}</p>` : ''}
      </div>`;
    const text = [
      `New ${label} inquiry`,
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
        templateKey: 'loan_request.admin_new',
        feature: 'loan_request',
        triggerEvent: 'created',
        to: 'admins@none',
        subject,
        skippedReason: 'no_admin_emails',
        entityType: 'loan_request',
        entityId: request.id,
      });
      return;
    }

    for (const admin of admins) {
      if (!admin.email?.trim()) continue;
      await this.mail.send({
        templateKey: 'loan_request.admin_new',
        feature: 'loan_request',
        triggerEvent: 'created',
        to: admin.email,
        subject,
        text,
        html,
        replyTo: request.email ?? undefined,
        recipientUserId: admin.id,
        recipientRole: 'admin',
        entityType: 'loan_request',
        entityId: request.id,
      });
    }
  }

  private async sendCustomerConfirmation(request: LoanRequest): Promise<void> {
    const label = LOAN_LABELS[request.loanType] ?? request.loanType;
    const subject = `We received your ${label} inquiry`;
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:560px">
        <h2 style="color:${BRAND_COLOR}">Thank you</h2>
        <p>Hi ${escapeHtmlForEmail(request.name)},</p>
        <p>We received your <strong>${escapeHtmlForEmail(label)}</strong> inquiry. Our team will contact you shortly.</p>
      </div>`;
    const text = `Hi ${request.name},\n\nWe received your ${label} inquiry. Our team will contact you shortly.`;

    await this.mail.send({
      templateKey: 'loan_request.customer_confirmation',
      feature: 'loan_request',
      triggerEvent: 'created',
      to: request.email!,
      subject,
      text,
      html,
      recipientRole: 'customer',
      entityType: 'loan_request',
      entityId: request.id,
    });
  }

  private async sendStatusChangeEmail(
    request: LoanRequest,
    previousStatus: LoanRequestStatus,
  ): Promise<void> {
    const label = LOAN_LABELS[request.loanType] ?? request.loanType;
    const prev = STATUS_LABELS[previousStatus] ?? previousStatus;
    const next = STATUS_LABELS[request.status] ?? request.status;
    const subject = `Your ${label} application — ${next}`;
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:560px">
        <h2 style="color:${BRAND_COLOR}">Loan application update</h2>
        <p>Hi ${escapeHtmlForEmail(request.name)},</p>
        <p>Your <strong>${escapeHtmlForEmail(label)}</strong> application status changed from <strong>${escapeHtmlForEmail(prev)}</strong> to <strong>${escapeHtmlForEmail(next)}</strong>.</p>
        <p>Our team will reach out if any action is needed from your side.</p>
      </div>`;
    const text = `Hi ${request.name},\n\nYour ${label} application status changed from ${prev} to ${next}.\n\nOur team will reach out if any action is needed.`;

    await this.mail.send({
      templateKey: 'loan_request.customer_status',
      feature: 'loan_request',
      triggerEvent: 'status_changed',
      to: request.email!,
      subject,
      text,
      html,
      recipientRole: 'customer',
      entityType: 'loan_request',
      entityId: request.id,
      metadata: { previousStatus, nextStatus: request.status },
    });
  }
}