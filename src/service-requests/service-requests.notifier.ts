import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { UsersService } from '../users/users.service';
import { escapeHtmlForEmail } from '../helper/escape-html';
import { BRAND_COLOR } from '../helper/email-theme';
import {
  EventManagementDetails,
  PackersMoversDetails,
  PaintingCleaningDetails,
  ServiceRequest,
  ServiceRequestStatus,
  ServiceType,
  Stop,
} from './entities/service-request.entity';

interface MailTransporter {
  sendMail(
    options: nodemailer.SendMailOptions,
  ): Promise<nodemailer.SentMessageInfo>;
}

const SERVICE_LABELS: Record<ServiceType, string> = {
  [ServiceType.PACKERS_MOVERS]: 'Packers & Movers',
  [ServiceType.PAINTING_CLEANING]: 'Painting & Cleaning',
  [ServiceType.EVENT_MANAGEMENT]: 'Event Management',
};

/**
 * Fire-and-forget notifier. All methods swallow errors (after logging) so
 * transient SMTP failures never fail the HTTP request that created / updated
 * the service request.
 */
@Injectable()
export class ServiceRequestsNotifier {
  private readonly logger = new Logger(ServiceRequestsNotifier.name);
  private mailTransporter: MailTransporter | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  notifyAdminsOfNewRequest(request: ServiceRequest): void {
    void this.sendNewRequestEmail(request).catch((err: unknown) => {
      this.logger.error(
        `Failed to notify admins for service request #${request.id}: ${String(err)}`,
      );
    });
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

  private async sendNewRequestEmail(request: ServiceRequest): Promise<void> {
    const admins = await this.usersService.findAllAdmins();
    const adminEmails = admins
      .map((a) => a.email)
      .filter((e): e is string => Boolean(e?.trim()));

    if (adminEmails.length === 0) {
      this.logger.warn(
        `No admin emails on file; skipping notification for service request #${request.id}`,
      );
      return;
    }

    const from = this.configService.get<string>('SMTP_FROM');
    if (!from) {
      this.logger.warn('SMTP_FROM not configured; skipping admin notification');
      return;
    }

    const transporter = this.getMailTransporter();
    if (!transporter) return;

    const label = SERVICE_LABELS[request.serviceType] ?? request.serviceType;
    const subject = `New ${label} request — ${request.name}`;

    const html = this.buildAdminHtml(request, label);
    const text = this.buildAdminText(request, label);

    for (const to of adminEmails) {
      try {
        await transporter.sendMail({
          from,
          to,
          replyTo: request.email ?? undefined,
          subject,
          text,
          html,
        });
      } catch (e) {
        this.logger.error(
          `Admin notification email to ${to} failed: ${String(e)}`,
        );
      }
    }
  }

  private async sendStatusChangeEmail(
    request: ServiceRequest,
    previousStatus: ServiceRequestStatus,
  ): Promise<void> {
    if (!request.email) return;
    const from = this.configService.get<string>('SMTP_FROM');
    if (!from) return;
    const transporter = this.getMailTransporter();
    if (!transporter) return;

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

    try {
      await transporter.sendMail({
        from,
        to: request.email,
        subject,
        text,
        html,
      });
    } catch (e) {
      this.logger.error(
        `Customer status email to ${request.email} failed: ${String(e)}`,
      );
    }
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
    if (request.serviceType === ServiceType.PAINTING_CLEANING) {
      return this.buildPaintingCleaningHtml(
        request.details as PaintingCleaningDetails,
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

  private buildPaintingCleaningHtml(d: PaintingCleaningDetails): string {
    const subTypeLabel: Record<string, string> = {
      full_painting: 'Full home painting',
      partial_painting: 'Partial / room painting',
      deep_cleaning: 'Deep home cleaning',
      bathroom_cleaning: 'Bathroom cleaning',
      sofa_cleaning: 'Sofa / upholstery cleaning',
      kitchen_cleaning: 'Kitchen deep cleaning',
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
    } else if (request.serviceType === ServiceType.PAINTING_CLEANING && d) {
      const pc = d as PaintingCleaningDetails;
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
    return lines.join('\n');
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

  private getMailTransporter(): MailTransporter | null {
    if (this.mailTransporter) return this.mailTransporter;
    const host = this.configService.get<string>('SMTP_HOST');
    const port = Number(this.configService.get<string>('SMTP_PORT') || 0);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (!host || !port || !user || !pass) {
      this.logger.warn(
        'SMTP not configured; service-request notifications will be skipped.',
      );
      return null;
    }

    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    this.mailTransporter = transport as MailTransporter;
    return this.mailTransporter;
  }
}
