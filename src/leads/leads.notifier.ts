import { Injectable, Logger } from '@nestjs/common';
import { escapeHtmlForEmail } from '../helper/escape-html';
import { BRAND_COLOR } from '../helper/email-theme';
import { MailService } from '../mail/mail.service';
import { User } from '../users/entities/user.entity';
import { Property } from '../properties/entities/property.entity';
import { LeadStatus, PropertyLead } from './entities/property-lead.entity';

const STATUS_LABELS: Record<LeadStatus, string> = {
  [LeadStatus.NEW]: 'New',
  [LeadStatus.CONTACTED]: 'Contacted',
  [LeadStatus.CLOSED]: 'Closed',
  [LeadStatus.ARCHIVED]: 'Archived',
};

@Injectable()
export class LeadsNotifier {
  private readonly logger = new Logger(LeadsNotifier.name);

  constructor(private readonly mail: MailService) {}

  notifyAgentNewLead(
    lead: PropertyLead,
    property: Property,
    tenant: User,
    agent: User,
  ): void {
    void this.sendAgentNewLeadEmail(lead, property, tenant, agent).catch(
      (err: unknown) => {
        this.logger.error(
          `Failed to notify agent for lead #${lead.id}: ${String(err)}`,
        );
      },
    );
  }

  notifyTenantStatusChange(
    lead: PropertyLead,
    property: Property,
    tenant: User,
    previousStatus: LeadStatus,
  ): void {
    if (previousStatus === lead.status || !tenant.email?.trim()) return;
    void this.sendTenantStatusEmail(
      lead,
      property,
      tenant,
      previousStatus,
    ).catch((err: unknown) => {
      this.logger.error(
        `Failed to notify tenant for lead #${lead.id}: ${String(err)}`,
      );
    });
  }

  private async sendAgentNewLeadEmail(
    lead: PropertyLead,
    property: Property,
    tenant: User,
    agent: User,
  ): Promise<void> {
    if (!agent.email?.trim()) {
      await this.mail.logSkipped({
        templateKey: 'property_lead.agent_new',
        feature: 'property_lead',
        triggerEvent: 'created',
        to: 'agent@none',
        subject: `New enquiry — ${property.title}`,
        skippedReason: 'no_agent_email',
        entityType: 'property_lead',
        entityId: lead.id,
        recipientUserId: agent.id,
        recipientRole: 'agent',
      });
      return;
    }

    const subject = `New enquiry — ${property.title}`;
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:560px">
        <h2 style="color:${BRAND_COLOR}">New property enquiry</h2>
        <p><strong>Property:</strong> ${escapeHtmlForEmail(property.title)}</p>
        <p><strong>Tenant:</strong> ${escapeHtmlForEmail(tenant.name ?? 'Tenant')}</p>
        <p><strong>Phone:</strong> ${escapeHtmlForEmail(tenant.phone ?? '—')}</p>
        ${tenant.email ? `<p><strong>Email:</strong> ${escapeHtmlForEmail(tenant.email)}</p>` : ''}
        ${lead.message ? `<p><strong>Message:</strong> ${escapeHtmlForEmail(lead.message)}</p>` : ''}
      </div>`;
    const text = [
      `New enquiry for ${property.title}`,
      `Tenant: ${tenant.name ?? 'Tenant'}`,
      `Phone: ${tenant.phone ?? '—'}`,
      tenant.email ? `Email: ${tenant.email}` : null,
      lead.message ? `Message: ${lead.message}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    await this.mail.send({
      templateKey: 'property_lead.agent_new',
      feature: 'property_lead',
      triggerEvent: 'created',
      to: agent.email,
      subject,
      text,
      html,
      replyTo: tenant.email ?? undefined,
      recipientUserId: agent.id,
      recipientRole: 'agent',
      entityType: 'property_lead',
      entityId: lead.id,
      metadata: { propertyId: property.id, tenantId: tenant.id },
    });
  }

  private async sendTenantStatusEmail(
    lead: PropertyLead,
    property: Property,
    tenant: User,
    previousStatus: LeadStatus,
  ): Promise<void> {
    const prev = STATUS_LABELS[previousStatus] ?? previousStatus;
    const next = STATUS_LABELS[lead.status] ?? lead.status;
    const subject = `Enquiry update — ${property.title}`;
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:560px">
        <h2 style="color:${BRAND_COLOR}">Enquiry update</h2>
        <p>Hi ${escapeHtmlForEmail(tenant.name ?? 'there')},</p>
        <p>Your enquiry for <strong>${escapeHtmlForEmail(property.title)}</strong> changed from <strong>${escapeHtmlForEmail(prev)}</strong> to <strong>${escapeHtmlForEmail(next)}</strong>.</p>
      </div>`;
    const text = `Hi ${tenant.name ?? 'there'},\n\nYour enquiry for ${property.title} changed from ${prev} to ${next}.`;

    await this.mail.send({
      templateKey: 'property_lead.tenant_status',
      feature: 'property_lead',
      triggerEvent: 'status_changed',
      to: tenant.email!,
      subject,
      text,
      html,
      recipientUserId: tenant.id,
      recipientRole: 'tenant',
      entityType: 'property_lead',
      entityId: lead.id,
      metadata: { previousStatus, nextStatus: lead.status, propertyId: property.id },
    });
  }
}