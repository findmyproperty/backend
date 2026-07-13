import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { VendorProfile } from '../vendors/entities/vendor-profile.entity';
import { Category } from '../categories/entities/category.entity';
import { escapeHtmlForEmail } from '../helper/escape-html';
import { BRAND_COLOR } from '../helper/email-theme';
import {
  EventManagementDetails,
  GeneralServicesDetails,
  HomeServicesDetails,
  ItServicesDetails,
  PackersMoversDetails,
  PaintingCleaningDetails,
  ServiceRequest,
  ServiceRequestStatus,
  ServiceType,
  Stop,
} from './entities/service-request.entity';
import {
  ServiceRequestEmailNotificationsDto,
  ServiceRequestEmailRecipient,
} from './dto/service-request-email-notifications.dto';

const SERVICE_LABELS: Record<ServiceType, string> = {
  [ServiceType.PACKERS_MOVERS]: 'Packers & Movers',
  [ServiceType.PAINTING_CLEANING]: 'Painting & Cleaning',
  [ServiceType.HOME_SERVICES]: 'Home Services',
  [ServiceType.EVENT_MANAGEMENT]: 'Event Management',
  [ServiceType.IT]: 'IT Services',
  [ServiceType.GENERAL]: 'General Services',
};

const VENDOR_CATEGORY_LABELS: Record<string, string> = {
  real_estate: 'Real estate',
  home_services: 'Home services',
  packers: 'Packers & movers',
  lawyer: 'Lawyer',
  ca: 'Chartered accountant',
  web_designer: 'Web designer',
  trainer: 'Trainer',
  tutor: 'Tutor',
  other: 'Other',
};

interface VendorContactInfo {
  userId: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  businessName: string | null;
  category: string | null;
  serviceLocations: string[] | null;
  workingHours: string | null;
}

/**
 * Fire-and-forget notifier. All methods swallow errors (after logging) so
 * transient SMTP failures never fail the HTTP request that created / updated
 * the service request.
 */
@Injectable()
export class ServiceRequestsNotifier {
  private readonly logger = new Logger(ServiceRequestsNotifier.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly mail: MailService,
    @InjectRepository(VendorProfile)
    private readonly vendorProfileRepo: Repository<VendorProfile>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  notifyAdminsOfNewRequest(request: ServiceRequest): void {
    void this.sendNewRequestEmail(request).catch((err: unknown) => {
      this.logger.error(
        `Failed to notify admins for service request #${request.id}: ${String(err)}`,
      );
    });
    if (request.email) {
      void this.sendCustomerConfirmation(request).catch((err: unknown) => {
        this.logger.error(
          `Failed to confirm service request #${request.id} to customer: ${String(err)}`,
        );
      });
    }
  }

  notifyStatusChange(
    request: ServiceRequest,
    previousStatus: ServiceRequestStatus,
  ): void {
    if (previousStatus === request.status) return;
    if (!request.email) return;
    void this.sendStatusChangeEmail(request, previousStatus).catch(
      (err: unknown) => {
        this.logger.error(
          `Failed to notify customer for service request #${request.id}: ${String(err)}`,
        );
      },
    );
  }

  notifyConfiguredUpdate(
    request: ServiceRequest,
    context: {
      previousStatus: ServiceRequestStatus;
      previousVendorUserId: number | null;
      config: ServiceRequestEmailNotificationsDto;
    },
  ): void {
    if (!context.config.enabled) return;
    void this.sendConfiguredUpdateEmails(request, context).catch(
      (err: unknown) => {
        this.logger.error(
          `Failed configured notifications for service request #${request.id}: ${String(err)}`,
        );
      },
    );
  }

  private async sendNewRequestEmail(request: ServiceRequest): Promise<void> {
    const admins = await this.usersService.findAllAdmins();
    const label = SERVICE_LABELS[request.serviceType] ?? request.serviceType;
    const subject = `New ${label} request — ${request.name}`;
    const html = this.buildAdminHtml(request, label);
    const text = this.buildAdminText(request, label);

    if (admins.length === 0) {
      await this.mail.logSkipped({
        templateKey: 'service_request.admin_new',
        feature: 'service_request',
        triggerEvent: 'created',
        to: 'admins@none',
        subject,
        skippedReason: 'no_admin_emails',
        entityType: 'service_request',
        entityId: request.id,
      });
      return;
    }

    for (const admin of admins) {
      if (!admin.email?.trim()) continue;
      await this.mail.send({
        templateKey: 'service_request.admin_new',
        feature: 'service_request',
        triggerEvent: 'created',
        to: admin.email,
        subject,
        text,
        html,
        replyTo: request.email ?? undefined,
        recipientUserId: admin.id,
        recipientRole: 'admin',
        entityType: 'service_request',
        entityId: request.id,
      });
    }
  }

  private async sendCustomerConfirmation(
    request: ServiceRequest,
  ): Promise<void> {
    const label = SERVICE_LABELS[request.serviceType] ?? request.serviceType;
    const subject = `We received your ${label} request`;
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:560px">
        <h2 style="color:${BRAND_COLOR}">Thank you</h2>
        <p>Hi ${escapeHtmlForEmail(request.name)},</p>
        <p>We received your <strong>${escapeHtmlForEmail(label)}</strong> request (ID #${request.id}). Our team will contact you shortly.</p>
      </div>`;
    const text = `Hi ${request.name},\n\nWe received your ${label} request (ID #${request.id}). Our team will contact you shortly.`;

    await this.mail.send({
      templateKey: 'service_request.customer_confirmation',
      feature: 'service_request',
      triggerEvent: 'created',
      to: request.email!,
      subject,
      text,
      html,
      recipientUserId: request.userId,
      recipientRole: 'customer',
      entityType: 'service_request',
      entityId: request.id,
    });
  }

  private async sendConfiguredUpdateEmails(
    request: ServiceRequest,
    context: {
      previousStatus: ServiceRequestStatus;
      previousVendorUserId: number | null;
      config: ServiceRequestEmailNotificationsDto;
    },
  ): Promise<void> {
    const label = SERVICE_LABELS[request.serviceType] ?? request.serviceType;
    const events = new Set(context.config.events);
    const recipients = new Set(context.config.recipients);
    const emailsByRecipient = await this.resolveRecipientEmails(
      request,
      recipients,
    );
    const admins = recipients.has('admin')
      ? await this.usersService.findAllAdmins()
      : [];

    const payloads: Array<{
      recipient: ServiceRequestEmailRecipient;
      subject: string;
      text: string;
      html: string;
    }> = [];

    if (
      events.has('status_changed') &&
      context.previousStatus !== request.status
    ) {
      for (const recipient of recipients) {
        payloads.push({
          recipient,
          subject: `${label} request #${request.id} status updated`,
          text: this.buildStatusChangedText(
            request,
            label,
            context.previousStatus,
            recipient,
          ),
          html: this.buildStatusChangedHtml(
            request,
            label,
            context.previousStatus,
            recipient,
          ),
        });
      }
    }

    if (
      events.has('completed') &&
      request.status === ServiceRequestStatus.COMPLETED
    ) {
      for (const recipient of recipients) {
        payloads.push({
          recipient,
          subject: `${label} request #${request.id} completed`,
          text: this.buildCompletedText(request, label, recipient),
          html: this.buildCompletedHtml(request, label, recipient),
        });
      }
    }

    if (
      events.has('vendor_assigned') &&
      request.assignedVendorUserId != null &&
      request.assignedVendorUserId !== context.previousVendorUserId
    ) {
      const vendor = await this.resolveVendorContact(
        request.assignedVendorUserId,
      );
      for (const recipient of recipients) {
        payloads.push({
          recipient,
          subject: `Vendor assigned to ${label} request #${request.id}`,
          text: this.buildVendorAssignedText(
            request,
            label,
            recipient,
            vendor,
          ),
          html: this.buildVendorAssignedHtml(
            request,
            label,
            recipient,
            vendor,
          ),
        });
      }
    }

    for (const payload of payloads) {
      const to = emailsByRecipient.get(payload.recipient) ?? [];
      for (const email of to) {
        const recipientUserId =
          payload.recipient === 'customer'
            ? (request.userId ?? null)
            : payload.recipient === 'vendor'
              ? request.assignedVendorUserId
              : (admins.find((a) => a.email === email)?.id ?? null);

        await this.mail.send({
          templateKey: `service_request.${payload.recipient}_update`,
          feature: 'service_request',
          triggerEvent: payload.subject.includes('Vendor assigned')
            ? 'vendor_assigned'
            : payload.subject.includes('completed')
              ? 'completed'
              : 'status_changed',
          to: email,
          subject: payload.subject,
          text: payload.text,
          html: payload.html,
          recipientUserId,
          recipientRole: payload.recipient,
          entityType: 'service_request',
          entityId: request.id,
          metadata: {
            previousStatus: context.previousStatus,
            nextStatus: request.status,
            events: [...events],
          },
        });
      }
    }
  }

  private async resolveRecipientEmails(
    request: ServiceRequest,
    recipients: Set<ServiceRequestEmailRecipient>,
  ): Promise<Map<ServiceRequestEmailRecipient, string[]>> {
    const emails = new Map<ServiceRequestEmailRecipient, string[]>();

    if (recipients.has('customer') && request.email?.trim()) {
      emails.set('customer', [request.email.trim()]);
    }

    if (recipients.has('admin')) {
      const admins = await this.usersService.findAllAdmins();
      const adminEmails = admins
        .map((a) => a.email)
        .filter((e): e is string => Boolean(e?.trim()));
      emails.set('admin', adminEmails);
    }

    if (recipients.has('vendor') && request.assignedVendorUserId != null) {
      try {
        const vendor = await this.usersService.findOne(
          request.assignedVendorUserId,
        );
        if (vendor.email?.trim()) {
          emails.set('vendor', [vendor.email.trim()]);
        }
      } catch (e) {
        this.logger.warn(
          `Could not resolve vendor email for service request #${request.id}: ${String(e)}`,
        );
      }
    }

    return emails;
  }

  private buildStatusChangedText(
    request: ServiceRequest,
    label: string,
    previousStatus: ServiceRequestStatus,
    recipient: ServiceRequestEmailRecipient,
  ): string {
    const intro =
      recipient === 'customer'
        ? `Hi ${request.name},`
        : recipient === 'vendor'
          ? 'Hi,'
          : 'Admin update:';
    return [
      intro,
      '',
      `The ${label} service request #${request.id} changed from "${previousStatus}" to "${request.status}".`,
      `Customer: ${request.name}`,
      ...(recipient === 'vendor' ? [] : [`Phone: ${request.phone}`]),
    ].join('\n');
  }

  private buildStatusChangedHtml(
    request: ServiceRequest,
    label: string,
    previousStatus: ServiceRequestStatus,
    recipient: ServiceRequestEmailRecipient,
  ): string {
    const intro =
      recipient === 'customer'
        ? `Hi ${escapeHtmlForEmail(request.name)},`
        : recipient === 'vendor'
          ? 'Hi,'
          : 'Admin update:';
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <p>${intro}</p>
        <p>The <b>${escapeHtmlForEmail(label)}</b> service request <b>#${request.id}</b> changed from
          <b>${escapeHtmlForEmail(previousStatus)}</b> to <b>${escapeHtmlForEmail(request.status)}</b>.</p>
        <p>Customer: ${escapeHtmlForEmail(request.name)}${
          recipient === 'vendor'
            ? ''
            : `<br/>Phone: ${escapeHtmlForEmail(request.phone)}`
        }</p>
      </div>
    `;
  }

  private buildCompletedText(
    request: ServiceRequest,
    label: string,
    recipient: ServiceRequestEmailRecipient,
  ): string {
    const intro =
      recipient === 'customer'
        ? `Hi ${request.name},`
        : recipient === 'vendor'
          ? 'Hi,'
          : 'Admin update:';
    return [
      intro,
      '',
      `The ${label} service request #${request.id} has been marked completed.`,
      `Customer: ${request.name}`,
    ].join('\n');
  }

  private buildCompletedHtml(
    request: ServiceRequest,
    label: string,
    recipient: ServiceRequestEmailRecipient,
  ): string {
    const intro =
      recipient === 'customer'
        ? `Hi ${escapeHtmlForEmail(request.name)},`
        : recipient === 'vendor'
          ? 'Hi,'
          : 'Admin update:';
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <p>${intro}</p>
        <p>The <b>${escapeHtmlForEmail(label)}</b> service request <b>#${request.id}</b> has been marked <b>completed</b>.</p>
        <p>Customer: ${escapeHtmlForEmail(request.name)}</p>
      </div>
    `;
  }

  private async resolveVendorContact(
    userId: number,
  ): Promise<VendorContactInfo | null> {
    try {
      const user = await this.usersService.findOne(userId);
      const profile = await this.vendorProfileRepo.findOneBy({ userId });
      let categoryName: string | null = null;
    if (profile?.categoryIds?.length) {
      const cat = await this.categoryRepo.findOneBy({ id: profile.categoryIds[0] });
      categoryName = cat?.name ?? null;
    }
    return {
        userId: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        businessName: profile?.businessName ?? null,
        category: categoryName,
        serviceLocations: profile?.serviceLocations ?? null,
        workingHours: profile?.workingHours ?? null,
      };
    } catch (e) {
      this.logger.warn(
        `Could not resolve vendor contact for user #${userId}: ${String(e)}`,
      );
      return null;
    }
  }

  private buildCustomerContactRows(
    request: ServiceRequest,
    options: { includePhone?: boolean } = {},
  ): Array<[string, string]> {
    const includePhone = options.includePhone ?? true;
    const rows: Array<[string, string]> = [['Name', request.name]];
    if (includePhone) rows.push(['Phone', request.phone]);
    if (request.email) rows.push(['Email', request.email]);
    if (request.city) rows.push(['City', request.city]);
    if (request.addressLine) rows.push(['Address', request.addressLine]);
    if (request.pincode) rows.push(['Pincode', request.pincode]);
    if (request.preferredDate)
      rows.push(['Preferred date', String(request.preferredDate)]);
    if (request.preferredSlot)
      rows.push(['Preferred slot', request.preferredSlot]);
    return rows;
  }

  private buildVendorContactRows(
    vendor: VendorContactInfo | null,
    options: { includePhone?: boolean } = {},
  ): Array<[string, string]> {
    const includePhone = options.includePhone ?? true;
    if (!vendor) return [['Vendor', 'Details unavailable']];
    const rows: Array<[string, string]> = [];
    const displayName =
      vendor.businessName?.trim() || vendor.name?.trim() || `Vendor #${vendor.userId}`;
    rows.push(['Business / name', displayName]);
    if (vendor.name?.trim() && vendor.businessName?.trim())
      rows.push(['Contact person', vendor.name.trim()]);
    if (includePhone && vendor.phone?.trim()) rows.push(['Phone', vendor.phone.trim()]);
    if (vendor.email?.trim()) rows.push(['Email', vendor.email.trim()]);
    if (vendor.category) {
      rows.push([
        'Category',
        VENDOR_CATEGORY_LABELS[vendor.category] ?? vendor.category,
      ]);
    }
    if (vendor.serviceLocations?.length) {
      rows.push(['Service locations', vendor.serviceLocations.join(', ')]);
    }
    if (vendor.workingHours?.trim()) {
      rows.push(['Working hours', vendor.workingHours.trim()]);
    }
    return rows;
  }

  private buildCustomerContactText(request: ServiceRequest): string {
    return this.buildCustomerContactRows(request)
      .map(([label, value]) => `${label}: ${value}`)
      .join('\n');
  }

  private buildVendorContactText(vendor: VendorContactInfo | null): string {
    return this.buildVendorContactRows(vendor)
      .map(([label, value]) => `${label}: ${value}`)
      .join('\n');
  }

  private buildInfoTableHtml(
    title: string,
    rows: Array<[string, string]>,
  ): string {
    if (rows.length === 0) return '';
    return `
      <h3 style="margin:16px 0 8px; font-size:14px; text-transform:uppercase; letter-spacing:0.5px; color:#6b7280;">${escapeHtmlForEmail(title)}</h3>
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse; width:100%;">
        ${rows
          .map(
            ([key, value]) =>
              `<tr><td style="border:1px solid #eee; width:160px;"><b>${escapeHtmlForEmail(key)}</b></td><td style="border:1px solid #eee;">${escapeHtmlForEmail(value)}</td></tr>`,
          )
          .join('')}
      </table>
    `;
  }

  private buildRequestContentText(request: ServiceRequest): string {
    const lines: string[] = [`Service: ${SERVICE_LABELS[request.serviceType] ?? request.serviceType}`];
    this.appendRequestDetailLines(lines, request);
    return lines.join('\n');
  }

  private buildRequestContentHtml(
    request: ServiceRequest,
    title = 'Request details',
  ): string {
    const detailsHtml = request.details ? this.buildDetailsHtml(request) : '';
    if (!detailsHtml) {
      return this.buildInfoTableHtml(title, [
        ['Service', SERVICE_LABELS[request.serviceType] ?? request.serviceType],
      ]);
    }
    return `
      <h3 style="margin:16px 0 8px; font-size:14px; text-transform:uppercase; letter-spacing:0.5px; color:#6b7280;">${escapeHtmlForEmail(title)}</h3>
      <p style="margin:0 0 8px;"><b>Service:</b> ${escapeHtmlForEmail(SERVICE_LABELS[request.serviceType] ?? request.serviceType)}</p>
      ${detailsHtml}
    `;
  }

  private buildVendorAssignedText(
    request: ServiceRequest,
    label: string,
    recipient: ServiceRequestEmailRecipient,
    vendor: VendorContactInfo | null,
  ): string {
    const vendorName =
      vendor?.name?.trim() ||
      vendor?.businessName?.trim() ||
      'there';
    const intro =
      recipient === 'customer'
        ? `Hi ${request.name},`
        : recipient === 'vendor'
          ? `Hi ${vendorName},`
          : 'Admin update:';
    const detail =
      recipient === 'vendor'
        ? `You were assigned to the ${label} service request #${request.id}.`
        : `A vendor was assigned to the ${label} service request #${request.id}.`;

    const sections: string[] = [intro, '', detail, ''];

    if (recipient === 'admin' || recipient === 'vendor') {
      sections.push(
        '-- Customer details --',
        this.buildCustomerContactRows(request, {
          includePhone: recipient === 'admin',
        })
          .map(([label, value]) => `${label}: ${value}`)
          .join('\n'),
        '',
      );
    }
    if (recipient === 'admin' || recipient === 'customer') {
      sections.push(
        '-- Vendor details --',
        this.buildVendorContactRows(vendor, {
          includePhone: recipient === 'admin',
        })
          .map(([label, value]) => `${label}: ${value}`)
          .join('\n'),
        '',
      );
    }
    sections.push(
      recipient === 'customer'
        ? '-- Your request details --'
        : '-- Request details --',
      this.buildRequestContentText(request),
    );

    return sections.join('\n');
  }

  private buildVendorAssignedHtml(
    request: ServiceRequest,
    label: string,
    recipient: ServiceRequestEmailRecipient,
    vendor: VendorContactInfo | null,
  ): string {
    const vendorName =
      vendor?.name?.trim() ||
      vendor?.businessName?.trim() ||
      'there';
    const intro =
      recipient === 'customer'
        ? `Hi ${escapeHtmlForEmail(request.name)},`
        : recipient === 'vendor'
          ? `Hi ${escapeHtmlForEmail(vendorName)},`
          : 'Admin update:';
    const detail =
      recipient === 'vendor'
        ? `You were assigned to the <b>${escapeHtmlForEmail(label)}</b> service request <b>#${request.id}</b>.`
        : `A vendor was assigned to the <b>${escapeHtmlForEmail(label)}</b> service request <b>#${request.id}</b>.`;

    const sections: string[] = [];
    if (recipient === 'admin' || recipient === 'vendor') {
      sections.push(
        this.buildInfoTableHtml(
          'Customer details',
          this.buildCustomerContactRows(request, {
            includePhone: recipient === 'admin',
          }),
        ),
      );
    }
    if (recipient === 'admin' || recipient === 'customer') {
      sections.push(
        this.buildInfoTableHtml(
          recipient === 'customer' ? 'Assigned vendor' : 'Vendor details',
          this.buildVendorContactRows(vendor, {
            includePhone: recipient === 'admin',
          }),
        ),
      );
    }
    sections.push(
      this.buildRequestContentHtml(
        request,
        recipient === 'customer' ? 'Your request details' : 'Request details',
      ),
    );

    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 640px;">
        <h2 style="margin:0 0 16px;">Vendor assigned — ${escapeHtmlForEmail(label)} request #${request.id}</h2>
        <p>${intro}</p>
        <p>${detail}</p>
        ${sections.join('')}
      </div>
    `;
  }

  private async sendStatusChangeEmail(
    request: ServiceRequest,
    previousStatus: ServiceRequestStatus,
  ): Promise<void> {
    if (!request.email) return;

    const label = SERVICE_LABELS[request.serviceType] ?? request.serviceType;
    const subject = `Your ${label} request update`;
    const safeName = escapeHtmlForEmail(request.name);
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <p>Hi ${safeName},</p>
        <p>Your <b>${escapeHtmlForEmail(label)}</b> request (ID #${request.id}) was updated from
          <b>${escapeHtmlForEmail(previousStatus)}</b> to <b>${escapeHtmlForEmail(request.status)}</b>.</p>
        <p>Our team will be in touch shortly if further action is needed.</p>
      </div>
    `;
    const text = `Hi ${request.name},\n\nYour ${label} request (ID #${request.id}) is now "${request.status}" (was "${previousStatus}").`;

    await this.mail.send({
      templateKey: 'service_request.customer_status',
      feature: 'service_request',
      triggerEvent: 'status_changed',
      to: request.email,
      subject,
      text,
      html,
      recipientUserId: request.userId,
      recipientRole: 'customer',
      entityType: 'service_request',
      entityId: request.id,
      metadata: { previousStatus, nextStatus: request.status },
    });
  }

  // -----------------------------------------------------------------
  // Email body builders
  // -----------------------------------------------------------------
  //
  // We render the email as two "cards" so admins can act immediately:
  //   1) Contact & request metadata (name, phone, preferred date, etc.)
  //   2) Service-specific details — Packers & Movers renders pickup + each
  //      drop as labelled blocks with clickable Google Maps links and a
  //      distance/drive-time summary; Painting & Cleaning renders the
  //      service location block. The generic detail dump that previously
  //      produced `[object Object]` for structured fields is gone.

  private buildAdminHtml(request: ServiceRequest, label: string): string {
    const contactRows: Array<[string, string]> = [
      ['Service', label],
      ['Request ID', `#${request.id}`],
      ['Name', request.name],
      ['Phone', request.phone],
    ];
    if (request.email) contactRows.push(['Email', request.email]);
    if (request.city) contactRows.push(['City', request.city]);
    if (request.addressLine) contactRows.push(['Address', request.addressLine]);
    if (request.pincode) contactRows.push(['Pincode', request.pincode]);
    if (request.preferredDate)
      contactRows.push(['Preferred date', String(request.preferredDate)]);
    if (request.preferredSlot)
      contactRows.push(['Preferred slot', request.preferredSlot]);
    if (request.userId)
      contactRows.push(['Linked user ID', String(request.userId)]);

    const detailsHtml = request.details
      ? this.buildDetailsHtml(request)
      : '';

    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.55; color: #333; max-width: 640px;">
        <h2 style="margin:0 0 16px;">New ${escapeHtmlForEmail(label)} request</h2>

        <h3 style="margin:16px 0 8px; font-size:14px; text-transform:uppercase; letter-spacing:0.5px; color:#6b7280;">Contact</h3>
        <table cellpadding="6" cellspacing="0" style="border-collapse:collapse; width:100%;">
          ${contactRows
            .map(
              ([k, v]) =>
                `<tr><td style="border:1px solid #eee; width:160px;"><b>${escapeHtmlForEmail(k)}</b></td><td style="border:1px solid #eee;">${escapeHtmlForEmail(v)}</td></tr>`,
            )
            .join('')}
        </table>

        ${detailsHtml}
      </div>
    `;
  }

  private buildDetailsHtml(request: ServiceRequest): string {
    if (request.serviceType === ServiceType.PACKERS_MOVERS) {
      return this.buildPackersMoversHtml(
        request.details as PackersMoversDetails,
      );
    }
    if (
      request.serviceType === ServiceType.PAINTING_CLEANING ||
      request.serviceType === ServiceType.HOME_SERVICES
    ) {
      return this.buildPaintingCleaningHtml(
        request.details as PaintingCleaningDetails | HomeServicesDetails,
      );
    }
    if (
      request.serviceType === ServiceType.IT ||
      request.serviceType === ServiceType.GENERAL
    ) {
      return this.buildSimpleServiceHtml(
        request.details as ItServicesDetails | GeneralServicesDetails,
      );
    }
    if (request.serviceType === ServiceType.EVENT_MANAGEMENT) {
      return this.buildEventManagementHtml(
        request.details as EventManagementDetails,
      );
    }
    return '';
  }

  private buildPackersMoversHtml(d: PackersMoversDetails): string {
    const moveTypeLabel: Record<string, string> = {
      home: 'Home shifting',
      office: 'Office shifting',
      vehicle: 'Vehicle transport',
    };
    const bhkLabel: Record<string, string> = {
      '1rk': '1 RK',
      '1': '1 BHK',
      '2': '2 BHK',
      '3': '3 BHK',
      '4+': '4+ BHK',
    };

    const metaRows: Array<[string, string]> = [
      ['Move type', moveTypeLabel[d.moveType] ?? d.moveType],
      ['Home size', bhkLabel[d.bhk] ?? d.bhk],
      ['Packing material', d.hasPackingMaterial ? 'Needed' : 'Not needed'],
    ];
    if (d.trip) {
      metaRows.push([
        'Estimated trip',
        `${d.trip.distanceKm.toFixed(1)} km · ${this.formatDuration(d.trip.durationMin)}`,
      ]);
    } else if (d.distanceKm) {
      metaRows.push(['Distance', `${d.distanceKm} km`]);
    }

    const pickup = d.pickup;
    const drops = d.drops ?? [];
    const hasStructured = Boolean(pickup) && drops.length > 0;

    const stopsHtml = hasStructured
      ? `
        ${this.buildStopCardHtml('Pickup', pickup!, BRAND_COLOR)}
        ${drops
          .map((stop, i) =>
            this.buildStopCardHtml(
              `Drop ${i + 1}${d.trip?.legs?.[i] ? ` · ${d.trip.legs[i].distanceKm.toFixed(1)} km · ${this.formatDuration(d.trip.legs[i].durationMin)}` : ''}`,
              stop,
              // Keep drops on a neutral indigo so pickup (brand) vs drops
              // stay visually distinguishable at a glance.
              '#6366f1',
            ),
          )
          .join('')}
      `
      : this.buildLegacyAddressHtml(d.pickupAddress, d.dropAddress);

    const notesHtml = d.notes
      ? `<div style="margin-top:12px; padding:10px 12px; border:1px solid #eee; background:#fafafa; border-radius:6px;">
          <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:#6b7280; margin-bottom:4px;">Customer notes</div>
          <div style="white-space:pre-wrap;">${escapeHtmlForEmail(d.notes)}</div>
        </div>`
      : '';

    return `
      <h3 style="margin:20px 0 8px; font-size:14px; text-transform:uppercase; letter-spacing:0.5px; color:#6b7280;">Move details</h3>
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse; width:100%;">
        ${metaRows
          .map(
            ([k, v]) =>
              `<tr><td style="border:1px solid #eee; width:160px;"><b>${escapeHtmlForEmail(k)}</b></td><td style="border:1px solid #eee;">${escapeHtmlForEmail(v)}</td></tr>`,
          )
          .join('')}
      </table>

      <h3 style="margin:20px 0 8px; font-size:14px; text-transform:uppercase; letter-spacing:0.5px; color:#6b7280;">Route</h3>
      ${stopsHtml}
      ${notesHtml}
    `;
  }

  private buildPaintingCleaningHtml(
    d: PaintingCleaningDetails | HomeServicesDetails,
  ): string {
    const subTypeLabel: Record<string, string> = {
      full_painting: 'Full home painting',
      partial_painting: 'Partial / room painting',
      deep_cleaning: 'Deep home cleaning',
      bathroom_cleaning: 'Bathroom cleaning',
      sofa_cleaning: 'Sofa / upholstery cleaning',
      kitchen_cleaning: 'Kitchen deep cleaning',
      carpenter: 'Carpenter',
      plumber: 'Plumber',
      electrician: 'Electrician',
    };
    const propertyTypeLabel: Record<string, string> = {
      apartment: 'Apartment',
      villa: 'Villa / Independent house',
      office: 'Office / Shop',
    };

    const metaRows: Array<[string, string]> = [
      ['Service', subTypeLabel[d.subType] ?? d.subType],
      ['Property type', propertyTypeLabel[d.propertyType] ?? d.propertyType],
      ['Size', d.bhkOrSqft],
    ];

    const locHtml =
      d.location && d.location.lat && d.location.lng
        ? this.buildStopCardHtml('Service location', d.location, BRAND_COLOR)
        : '';

    const notesHtml = d.notes
      ? `<div style="margin-top:12px; padding:10px 12px; border:1px solid #eee; background:#fafafa; border-radius:6px;">
          <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:#6b7280; margin-bottom:4px;">Customer notes</div>
          <div style="white-space:pre-wrap;">${escapeHtmlForEmail(d.notes)}</div>
        </div>`
      : '';

    return `
      <h3 style="margin:20px 0 8px; font-size:14px; text-transform:uppercase; letter-spacing:0.5px; color:#6b7280;">Service details</h3>
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse; width:100%;">
        ${metaRows
          .map(
            ([k, v]) =>
              `<tr><td style="border:1px solid #eee; width:160px;"><b>${escapeHtmlForEmail(k)}</b></td><td style="border:1px solid #eee;">${escapeHtmlForEmail(v)}</td></tr>`,
          )
          .join('')}
      </table>
      ${locHtml ? '<h3 style="margin:20px 0 8px; font-size:14px; text-transform:uppercase; letter-spacing:0.5px; color:#6b7280;">Location</h3>' : ''}
      ${locHtml}
      ${notesHtml}
    `;
  }

  private buildSimpleServiceHtml(
    d: ItServicesDetails | GeneralServicesDetails,
  ): string {
    const subTypeLabel: Record<string, string> = {
      web_design: 'Web design',
      server_tech: 'Server tech',
      networking: 'Networking / Wi-Fi',
      software_installation: 'Software installation',
      cctv_setup: 'CCTV setup',
      printer_setup: 'Printer setup',
      handyman: 'Handyman',
      errands: 'Errands & assistance',
      furniture_assembly: 'Furniture assembly',
      other: 'Other general help',
    };

    const metaRows: Array<[string, string]> = [
      ['Service', subTypeLabel[d.subType] ?? d.subType],
    ];

    const notesHtml = d.notes
      ? `<div style="margin-top:12px; padding:10px 12px; border:1px solid #eee; background:#fafafa; border-radius:6px;">
          <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:#6b7280; margin-bottom:4px;">Customer notes</div>
          <div style="white-space:pre-wrap;">${escapeHtmlForEmail(d.notes)}</div>
        </div>`
      : '';

    return `
      <h3 style="margin:20px 0 8px; font-size:14px; text-transform:uppercase; letter-spacing:0.5px; color:#6b7280;">Service details</h3>
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse; width:100%;">
        ${metaRows
          .map(
            ([k, v]) =>
              `<tr><td style="border:1px solid #eee; width:160px;"><b>${escapeHtmlForEmail(k)}</b></td><td style="border:1px solid #eee;">${escapeHtmlForEmail(v)}</td></tr>`,
          )
          .join('')}
      </table>
      ${notesHtml}
    `;
  }

  private buildEventManagementHtml(d: EventManagementDetails): string {
    const eventTypeLabel: Record<string, string> = {
      birthday: 'Birthday',
      wedding: 'Wedding',
      baby_shower: 'Baby shower',
      corporate: 'Corporate event',
    };
    const venueTypeLabel: Record<string, string> = {
      home: 'Home',
      banquet: 'Banquet hall',
      hotel: 'Hotel',
      outdoor: 'Outdoor',
      office: 'Office',
      other: 'Other',
    };
    const serviceLabel: Record<string, string> = {
      decoration: 'Decoration',
      catering: 'Catering',
      photography: 'Photography',
      music: 'Music / DJ',
      hosting: 'Host / anchor',
      return_gifts: 'Return gifts',
      venue_booking: 'Venue booking',
    };

    const metaRows: Array<[string, string]> = [
      ['Event type', eventTypeLabel[d.eventType] ?? d.eventType],
      ['Venue type', venueTypeLabel[d.venueType] ?? d.venueType],
      ['Guests', String(d.guestCount)],
      [
        'Services',
        (d.services ?? []).map((s) => serviceLabel[s] ?? s).join(', '),
      ],
    ];
    if (d.budgetRange) metaRows.push(['Budget', d.budgetRange]);
    if (d.themeOrStyle) metaRows.push(['Theme / style', d.themeOrStyle]);

    const locHtml =
      d.location && d.location.lat && d.location.lng
        ? this.buildStopCardHtml('Event location', d.location, BRAND_COLOR)
        : '';

    const notesHtml = d.notes
      ? `<div style="margin-top:12px; padding:10px 12px; border:1px solid #eee; background:#fafafa; border-radius:6px;">
          <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:#6b7280; margin-bottom:4px;">Customer notes</div>
          <div style="white-space:pre-wrap;">${escapeHtmlForEmail(d.notes)}</div>
        </div>`
      : '';

    return `
      <h3 style="margin:20px 0 8px; font-size:14px; text-transform:uppercase; letter-spacing:0.5px; color:#6b7280;">Event details</h3>
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse; width:100%;">
        ${metaRows
          .map(
            ([k, v]) =>
              `<tr><td style="border:1px solid #eee; width:160px;"><b>${escapeHtmlForEmail(k)}</b></td><td style="border:1px solid #eee;">${escapeHtmlForEmail(v)}</td></tr>`,
          )
          .join('')}
      </table>
      ${locHtml ? '<h3 style="margin:20px 0 8px; font-size:14px; text-transform:uppercase; letter-spacing:0.5px; color:#6b7280;">Location</h3>' : ''}
      ${locHtml}
      ${notesHtml}
    `;
  }

  private buildStopCardHtml(
    title: string,
    stop: Stop,
    accent: string,
  ): string {
    const mapHref = this.mapLinkFor(stop);
    const notes = stop.notes?.trim();
    return `
      <div style="border:1px solid #eee; border-left:4px solid ${accent}; border-radius:6px; padding:10px 12px; margin-bottom:8px;">
        <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:#6b7280;">${escapeHtmlForEmail(title)}</div>
        <div style="font-weight:600; color:#111; margin:2px 0 4px;">${escapeHtmlForEmail(stop.label)}</div>
        ${notes ? `<div style="color:#6b7280; font-size:13px; margin-bottom:6px;">${escapeHtmlForEmail(notes)}</div>` : ''}
        <a href="${mapHref}" style="display:inline-block; color:${BRAND_COLOR}; text-decoration:none; font-size:13px;">
          Open in Google Maps &rarr;
        </a>
      </div>
    `;
  }

  private buildLegacyAddressHtml(
    pickupAddress?: string,
    dropAddress?: string,
  ): string {
    const rows: Array<[string, string]> = [];
    if (pickupAddress) rows.push(['Pickup address', pickupAddress]);
    if (dropAddress) rows.push(['Drop address', dropAddress]);
    if (rows.length === 0) return '';
    return `
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse; width:100%;">
        ${rows
          .map(
            ([k, v]) =>
              `<tr><td style="border:1px solid #eee; width:160px;"><b>${escapeHtmlForEmail(k)}</b></td><td style="border:1px solid #eee;">${escapeHtmlForEmail(v)}</td></tr>`,
          )
          .join('')}
      </table>
    `;
  }

  private buildAdminText(request: ServiceRequest, label: string): string {
    const lines: string[] = [
      `New ${label} request`,
      ``,
      `Request ID: #${request.id}`,
      `Name: ${request.name}`,
      `Phone: ${request.phone}`,
    ];
    if (request.email) lines.push(`Email: ${request.email}`);
    if (request.city) lines.push(`City: ${request.city}`);
    if (request.addressLine) lines.push(`Address: ${request.addressLine}`);
    if (request.pincode) lines.push(`Pincode: ${request.pincode}`);
    if (request.preferredDate)
      lines.push(`Preferred date: ${String(request.preferredDate)}`);
    if (request.preferredSlot)
      lines.push(`Preferred slot: ${request.preferredSlot}`);
    if (request.userId) lines.push(`Linked user ID: ${request.userId}`);

    this.appendRequestDetailLines(lines, request);
    return lines.join('\n');
  }

  private appendRequestDetailLines(
    lines: string[],
    request: ServiceRequest,
  ): void {
    const d = request.details;
    if (request.serviceType === ServiceType.PACKERS_MOVERS && d) {
      const pm = d as PackersMoversDetails;
      lines.push(``, `-- Move details --`);
      lines.push(`Move type: ${pm.moveType}`);
      lines.push(`Home size: ${pm.bhk}`);
      lines.push(
        `Packing material: ${pm.hasPackingMaterial ? 'Needed' : 'Not needed'}`,
      );
      if (pm.trip) {
        lines.push(
          `Estimated trip: ${pm.trip.distanceKm.toFixed(1)} km · ${this.formatDuration(pm.trip.durationMin)}`,
        );
      }
      if (pm.pickup) {
        lines.push(``, `Pickup: ${pm.pickup.label}`);
        if (pm.pickup.notes) lines.push(`  Notes: ${pm.pickup.notes}`);
        lines.push(`  Map: ${this.mapLinkFor(pm.pickup)}`);
      } else if (pm.pickupAddress) {
        lines.push(``, `Pickup address: ${pm.pickupAddress}`);
      }
      (pm.drops ?? []).forEach((drop, i) => {
        const legLabel = pm.trip?.legs?.[i]
          ? ` · ${pm.trip.legs[i].distanceKm.toFixed(1)} km · ${this.formatDuration(pm.trip.legs[i].durationMin)}`
          : '';
        lines.push(``, `Drop ${i + 1}${legLabel}: ${drop.label}`);
        if (drop.notes) lines.push(`  Notes: ${drop.notes}`);
        lines.push(`  Map: ${this.mapLinkFor(drop)}`);
      });
      if ((pm.drops ?? []).length === 0 && pm.dropAddress) {
        lines.push(`Drop address: ${pm.dropAddress}`);
      }
      if (pm.notes) lines.push(``, `Customer notes:`, pm.notes);
    } else if (
      (request.serviceType === ServiceType.PAINTING_CLEANING ||
        request.serviceType === ServiceType.HOME_SERVICES) &&
      d
    ) {
      const pc = d as PaintingCleaningDetails | HomeServicesDetails;
      lines.push(``, `-- Service details --`);
      lines.push(`Service: ${pc.subType}`);
      lines.push(`Property type: ${pc.propertyType}`);
      lines.push(`Size: ${pc.bhkOrSqft}`);
      if (pc.location) {
        lines.push(``, `Service location: ${pc.location.label}`);
        if (pc.location.notes) lines.push(`  Notes: ${pc.location.notes}`);
        lines.push(`  Map: ${this.mapLinkFor(pc.location)}`);
      }
      if (pc.notes) lines.push(``, `Customer notes:`, pc.notes);
    } else if (
      (request.serviceType === ServiceType.IT ||
        request.serviceType === ServiceType.GENERAL) &&
      d
    ) {
      const simple = d as ItServicesDetails | GeneralServicesDetails;
      lines.push(``, `-- Service details --`);
      lines.push(`Service: ${simple.subType}`);
      if (simple.notes) lines.push(``, `Customer notes:`, simple.notes);
    } else if (request.serviceType === ServiceType.EVENT_MANAGEMENT && d) {
      const em = d as EventManagementDetails;
      lines.push(``, `-- Event details --`);
      lines.push(`Event type: ${em.eventType}`);
      lines.push(`Venue type: ${em.venueType}`);
      lines.push(`Guests: ${em.guestCount}`);
      lines.push(`Services: ${(em.services ?? []).join(', ')}`);
      if (em.budgetRange) lines.push(`Budget: ${em.budgetRange}`);
      if (em.themeOrStyle) lines.push(`Theme / style: ${em.themeOrStyle}`);
      if (em.location) {
        lines.push(``, `Event location: ${em.location.label}`);
        if (em.location.notes) lines.push(`  Notes: ${em.location.notes}`);
        lines.push(`  Map: ${this.mapLinkFor(em.location)}`);
      }
      if (em.notes) lines.push(``, `Customer notes:`, em.notes);
    }
  }

  private mapLinkFor(stop: Stop): string {
    if (stop.placeId) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.label)}&query_place_id=${encodeURIComponent(stop.placeId)}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${stop.lat},${stop.lng}`;
  }

  private formatDuration(min: number): string {
    if (!Number.isFinite(min) || min <= 0) return '—';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }

}
