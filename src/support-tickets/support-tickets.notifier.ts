import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { escapeHtmlForEmail } from '../helper/escape-html';
import { BRAND_COLOR, BRAND_ON_COLOR } from '../helper/email-theme';
import { AdminMailNotifier } from '../mail/admin-mail.notifier';
import { SupportTicket } from './entities/support-ticket.entity';

@Injectable()
export class SupportTicketsNotifier {
  constructor(
    private readonly adminMail: AdminMailNotifier,
    private readonly configService: ConfigService,
  ) {}

  notifyAdminsOfNewTicket(
    ticket: SupportTicket,
    submitter: { name: string | null; phone: string | null; role: string },
  ): void {
    const subject = `Support ticket — ${ticket.subject}`;
    const adminUrl = this.adminComplaintsUrl();
    const safeSubject = escapeHtmlForEmail(ticket.subject);
    const safeBody = escapeHtmlForEmail(ticket.body).replace(/\r?\n/g, '<br/>');
    const safeName = escapeHtmlForEmail(submitter.name?.trim() || 'User');
    const safeRole = escapeHtmlForEmail(ticket.userRole);
    const safeCategory = escapeHtmlForEmail(ticket.category);
    const phone = submitter.phone?.trim()
      ? escapeHtmlForEmail(submitter.phone)
      : '—';

    const text = [
      'New support ticket submitted.',
      '',
      `Ticket #${ticket.id}`,
      `From: ${submitter.name ?? 'User'} (${ticket.userRole})`,
      `Category: ${ticket.category}`,
      `Subject: ${ticket.subject}`,
      '',
      ticket.body,
      '',
      `View: ${adminUrl}`,
    ].join('\n');

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:560px;line-height:1.55;color:#333">
        <h2 style="color:${BRAND_COLOR};margin:0 0 12px">New support ticket</h2>
        <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;margin:12px 0">
          <tr><td style="border:1px solid #eee;width:120px"><b>Ticket</b></td><td style="border:1px solid #eee">#${ticket.id}</td></tr>
          <tr><td style="border:1px solid #eee"><b>From</b></td><td style="border:1px solid #eee">${safeName} (${safeRole})</td></tr>
          <tr><td style="border:1px solid #eee"><b>Phone</b></td><td style="border:1px solid #eee">${phone}</td></tr>
          <tr><td style="border:1px solid #eee"><b>Category</b></td><td style="border:1px solid #eee">${safeCategory}</td></tr>
          <tr><td style="border:1px solid #eee"><b>Subject</b></td><td style="border:1px solid #eee">${safeSubject}</td></tr>
        </table>
        <div style="border:1px solid #eee;border-radius:8px;padding:12px;margin:12px 0">${safeBody}</div>
        <a href="${adminUrl}" style="display:inline-block;padding:10px 16px;background:${BRAND_COLOR};color:${BRAND_ON_COLOR};text-decoration:none;border-radius:6px;font-weight:600">Open complaints</a>
      </div>`;

    this.adminMail.notifyAllAdmins({
      templateKey: 'support_ticket.admin_new',
      feature: 'support_ticket',
      triggerEvent: 'created',
      subject,
      text,
      html,
      entityType: 'support_ticket',
      entityId: ticket.id,
      metadata: {
        userId: ticket.userId,
        userRole: ticket.userRole,
        category: ticket.category,
      },
    });
  }

  private adminComplaintsUrl(): string {
    const base =
      this.configService.get<string>('CLIENT_URL')?.trim() ||
      'http://localhost:3000';
    return `${base.replace(/\/+$/, '')}/admin/complaints`;
  }
}
