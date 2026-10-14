import type { ConfigService } from '@nestjs/config';
import { buildPropertyPath } from './property-slug';

/** Trimmed site origin without trailing slash. */
export function resolveClientBaseUrl(config: ConfigService): string {
  const raw =
    config.get<string>('CLIENT_URL')?.trim() ||
    config.get<string>('CLIENT_APPROVAL_URL')?.trim() ||
    'http://localhost:3000';
  return raw.replace(/\/+$/, '');
}

export function adminApprovalsUrl(base: string): string {
  return `${base}/approvals`;
}

export function tenantListingsUrl(base: string): string {
  return `${base}/listings`;
}

export function editPropertyUrl(base: string, id: number | string): string {
  return `${base}/edit-property/${id}`;
}

export function publicPropertyUrl(
  base: string,
  id: number | string,
  title?: string | null,
): string {
  return `${base}${buildPropertyPath(id, title)}`;
}

export function myRequestsUrl(base: string): string {
  return `${base}/my-requests`;
}

export function vendorLeadUrl(base: string, leadId: number | string): string {
  return `${base}/leads/${leadId}`;
}

export function agentLeadsUrl(base: string): string {
  return `${base}/leads`;
}

export function adminServiceRequestsUrl(base: string): string {
  return `${base}/admin/service-requests`;
}

export function adminVendorsUrl(base: string): string {
  return `${base}/admin/vendors`;
}

export function adminVendorLeadsUrl(base: string): string {
  return `${base}/admin/vendor-leads`;
}

export function adminComplaintsUrl(base: string): string {
  return `${base}/admin/complaints`;
}

export function vendorProfileUrl(base: string): string {
  return `${base}/profile`;
}

export function publicVendorUrl(
  base: string,
  slugOrId: string | number,
): string {
  return `${base}/vendors/${encodeURIComponent(String(slugOrId))}`;
}

export function emailCtaButton(href: string, label: string): string {
  return `<p style="margin:16px 0;"><a href="${href}" style="display:inline-block;padding:10px 20px;background-color:#333;color:white;text-decoration:none;border-radius:5px;font-weight:bold;">${label}</a></p>`;
}
