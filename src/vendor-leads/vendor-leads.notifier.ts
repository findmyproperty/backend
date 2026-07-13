import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { escapeHtmlForEmail } from '../helper/escape-html';
import { BRAND_COLOR, BRAND_ON_COLOR } from '../helper/email-theme';
import { AdminMailNotifier } from '../mail/admin-mail.notifier';
import { VendorLead } from './entities/vendor-lead.entity';

@Injectable()
export class VendorLeadsNotifier {
  constructor(
    private readonly adminMail: AdminMailNotifier,
    private readonly configService: ConfigService,
  ) {}

  notifyAdminsOfPendingApproval(lead: VendorLead, vendorLabel: string): void {
    const subject = `Lead awaiting approval — ${lead.customerName}`;
    const adminUrl = this.adminVendorLeadsUrl();
    const safeCustomer = escapeHtmlForEmail(lead.customerName);
    const safeVendor = escapeHtmlForEmail(vendorLabel);
    const serviceRequest = lead.serviceRequestId
      ? `Service request #${lead.serviceRequestId}`
      : 'Manual lead';

    const text = [
      'A vendor lead needs admin approval before the partner can accept or reject.',
      '',
      `Lead ID: #${lead.id}`,
      `Customer: ${lead.customerName}`,
      `Assigned vendor: ${vendorLabel}`,
      serviceRequest,
      lead.area ? `Area: ${lead.area}` : null,
      lead.preferredDate ? `Preferred date: ${lead.preferredDate}` : null,
      '',
      `Approve or reject: ${adminUrl}`,
    ]
      .filter(Boolean)
      .join('\n');

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:560px;line-height:1.55;color:#333">
        <h2 style="color:${BRAND_COLOR};margin:0 0 12px">Lead awaiting approval</h2>
        <p>Approve this lead so the assigned vendor can accept or reject it.</p>
        <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;margin:12px 0">
          <tr><td style="border:1px solid #eee;width:150px"><b>Lead ID</b></td><td style="border:1px solid #eee">#${lead.id}</td></tr>
          <tr><td style="border:1px solid #eee"><b>Customer</b></td><td style="border:1px solid #eee">${safeCustomer}</td></tr>
          <tr><td style="border:1px solid #eee"><b>Vendor</b></td><td style="border:1px solid #eee">${safeVendor}</td></tr>
          <tr><td style="border:1px solid #eee"><b>Source</b></td><td style="border:1px solid #eee">${escapeHtmlForEmail(serviceRequest)}</td></tr>
          ${lead.area ? `<tr><td style="border:1px solid #eee"><b>Area</b></td><td style="border:1px solid #eee">${escapeHtmlForEmail(lead.area)}</td></tr>` : ''}
          ${lead.preferredDate ? `<tr><td style="border:1px solid #eee"><b>Preferred date</b></td><td style="border:1px solid #eee">${escapeHtmlForEmail(String(lead.preferredDate))}</td></tr>` : ''}
        </table>
        <a href="${adminUrl}" style="display:inline-block;padding:10px 16px;background:${BRAND_COLOR};color:${BRAND_ON_COLOR};text-decoration:none;border-radius:6px;font-weight:600">Review vendor leads</a>
      </div>`;

    this.adminMail.notifyAllAdmins({
      templateKey: 'vendor_lead.pending_approval',
      feature: 'vendor_lead',
      triggerEvent: 'pending_admin_review',
      subject,
      text,
      html,
      entityType: 'vendor_lead',
      entityId: lead.id,
      metadata: {
        vendorUserId: lead.vendorUserId,
        serviceRequestId: lead.serviceRequestId,
      },
    });
  }

  private adminVendorLeadsUrl(): string {
    const base =
      this.configService.get<string>('CLIENT_URL')?.trim() ||
      'http://localhost:3000';
    return `${base.replace(/\/+$/, '')}/admin/vendor-leads`;
  }
}
