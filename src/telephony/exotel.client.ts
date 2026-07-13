import { Logger } from '@nestjs/common';

export interface ExotelConnectCallResult {
  callSid: string;
  status: string;
}

export class ExotelClient {
  private readonly logger = new Logger(ExotelClient.name);

  constructor(
    private readonly apiKey: string,
    private readonly apiToken: string,
    private readonly accountSid: string,
    private readonly apiBaseUrl: string,
  ) {}

  async connectTwoNumbers(input: {
    from: string;
    to: string;
    callerId: string;
    customField?: string;
    statusCallback?: string;
  }): Promise<ExotelConnectCallResult> {
    const body = new URLSearchParams({
      From: input.from,
      To: input.to,
      CallerId: input.callerId,
      CallType: 'trans',
    });

    if (input.customField) {
      body.set('CustomField', input.customField.slice(0, 128));
    }
    if (input.statusCallback) {
      body.set('StatusCallback', input.statusCallback);
      body.set('StatusCallbackEvents[0]', 'terminal');
      body.set('StatusCallbackContentType', 'application/json');
    }

    const url = `${this.apiBaseUrl}/v1/Accounts/${encodeURIComponent(this.accountSid)}/Calls/connect.json`;
    const auth = Buffer.from(`${this.apiKey}:${this.apiToken}`).toString(
      'base64',
    );

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const raw = await response.text();
    let payload: unknown;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = raw;
    }

    if (!response.ok) {
      this.logger.error(
        `Exotel connect failed (${response.status}): ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`,
      );
      const message =
        typeof payload === 'object' &&
        payload !== null &&
        'RestException' in payload &&
        typeof (payload as { RestException?: { Message?: string } }).RestException
          ?.Message === 'string'
          ? (payload as { RestException: { Message: string } }).RestException
              .Message
          : `Exotel call failed (${response.status})`;
      throw new Error(message);
    }

    const call =
      typeof payload === 'object' &&
      payload !== null &&
      'Call' in payload &&
      typeof (payload as { Call?: { Sid?: string; Status?: string } }).Call ===
        'object'
        ? (payload as { Call: { Sid?: string; Status?: string } }).Call
        : null;

    if (!call?.Sid) {
      throw new Error('Exotel did not return a call SID');
    }

    return {
      callSid: call.Sid,
      status: call.Status ?? 'queued',
    };
  }
}

/** Normalize phone numbers for Exotel (E.164 for Indian mobiles). */
export function normalizeExotelPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith('+')) {
    return trimmed.replace(/\s+/g, '');
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `+91${digits.slice(1)}`;
  }

  return trimmed;
}

/** Display-friendly masked line number (keep ExoPhone formatting from env). */
export function formatVirtualNumberForDisplay(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith('+')) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  return trimmed;
}
