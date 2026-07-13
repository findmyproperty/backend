import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { escapeHtmlForEmail } from '../helper/escape-html';
import { BRAND_COLOR, BRAND_ON_COLOR } from '../helper/email-theme';
import { AdminMailNotifier } from '../mail/admin-mail.notifier';
import { User } from '../users/entities/user.entity';
import { VendorProfile } from './entities/vendor-profile.entity';

@Injectable()
export class VendorsNotifier {
  constructor(
    private readonly adminMail: AdminMailNotifier,
    private readonly configService: ConfigService,
  ) {}

  notifyAdminsOfKycPending(profile: VendorProfile, user: User): void {
    const businessName =
      profile.businessName?.trim() || user.name?.trim() || `Vendor #${user.id}`;
    const subject = `Vendor KYC pending review — ${businessName}`;
    const adminUrl = this.adminVendorsUrl();
    const safeName = escapeHtmlForEmail(businessName);
    const phone = user.phone?.trim() ? escapeHtmlForEmail(user.phone) : '—';
    const email = user.email?.trim() ? escapeHtmlForEmail(user.email) : '—';

    const text = [
      'A vendor partner profile is awaiting KYC review.',
      '',
      `Business: ${businessName}`,
      `Vendor user ID: ${user.id}`,
      `Phone: ${user.phone ?? '—'}`,
      `Email: ${user.email ?? '—'}`,
      '',
      `Review: ${adminUrl}`,
    ].join('\n');

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:560px;line-height:1.55;color:#333">
        <h2 style="color:${BRAND_COLOR};margin:0 0 12px">Vendor KYC pending</h2>
        <p>A partner profile needs verification before they can accept leads.</p>
        <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;margin:12px 0">
          <tr><td style="border:1px solid #eee;width:140px"><b>Business</b></td><td style="border:1px solid #eee">${safeName}</td></tr>
          <tr><td style="border:1px solid #eee"><b>User ID</b></td><td style="border:1px solid #eee">${user.id}</td></tr>
          <tr><td style="border:1px solid #eee"><b>Phone</b></td><td style="border:1px solid #eee">${phone}</td></tr>
          <tr><td style="border:1px solid #eee"><b>Email</b></td><td style="border:1px solid #eee">${email}</td></tr>
        </table>
        <a href="${adminUrl}" style="display:inline-block;padding:10px 16px;background:${BRAND_COLOR};color:${BRAND_ON_COLOR};text-decoration:none;border-radius:6px;font-weight:600">Review vendor partners</a>
      </div>`;

    this.adminMail.notifyAllAdmins({
      templateKey: 'vendor.kyc_pending',
      feature: 'vendor',
      triggerEvent: 'kyc_pending',
      subject,
      text,
      html,
      replyTo: user.email ?? undefined,
      entityType: 'vendor_profile',
      entityId: profile.id,
      metadata: { vendorUserId: user.id },
    });
  }

  private adminVendorsUrl(): string {
    const base =
      this.configService.get<string>('CLIENT_URL')?.trim() ||
      'http://localhost:3000';
    return `${base.replace(/\/+$/, '')}/admin/vendors`;
  }
}
