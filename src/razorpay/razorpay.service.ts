import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

type RazorpayMethod = 'GET' | 'POST' | 'PATCH';

export interface RazorpayOrder {
  id: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: string;
  notes?: Record<string, unknown>;
  created_at: number;
}

export interface RazorpayContact {
  id: string;
  entity: string;
  name: string;
  contact?: string;
  email?: string;
  type?: string;
  reference_id?: string;
  active?: boolean;
  created_at?: number;
}

export interface RazorpayFundAccount {
  id: string;
  entity: string;
  contact_id: string;
  account_type: 'bank_account' | 'vpa';
  bank_account?: {
    ifsc?: string;
    bank_name?: string;
    name?: string;
    account_number?: string;
  };
  vpa?: {
    username?: string;
    handle?: string;
    address?: string;
  };
  active?: boolean;
  created_at?: number;
}

export interface RazorpayPayout {
  id: string;
  entity: string;
  fund_account_id: string;
  amount: number;
  currency: string;
  status: string;
  utr?: string | null;
  mode?: string;
  purpose?: string;
  reference_id?: string;
  narration?: string;
  fees?: number;
  tax?: number;
  status_details?: Record<string, unknown> | null;
  created_at?: number;
}

@Injectable()
export class RazorpayService {
  constructor(private readonly configService: ConfigService) {}

  getKeyId(): string {
    return this.getRequiredConfig('RAZORPAY_KEY_ID');
  }

  createOrder(input: {
    amountPaise: number;
    currency: string;
    receipt: string;
    notes?: Record<string, unknown>;
  }): Promise<RazorpayOrder> {
    return this.request<RazorpayOrder>('POST', '/orders', {
      amount: input.amountPaise,
      currency: input.currency,
      receipt: input.receipt,
      notes: input.notes ?? {},
    });
  }

  createContact(input: {
    name: string;
    email?: string | null;
    contact?: string | null;
    type: string;
    referenceId: string;
    notes?: Record<string, unknown>;
  }): Promise<RazorpayContact> {
    return this.request<RazorpayContact>('POST', '/contacts', {
      name: input.name,
      ...(input.email ? { email: input.email } : {}),
      ...(input.contact ? { contact: input.contact } : {}),
      type: input.type,
      reference_id: input.referenceId,
      notes: input.notes ?? {},
    });
  }

  createBankFundAccount(input: {
    contactId: string;
    name: string;
    ifsc: string;
    accountNumber: string;
  }): Promise<RazorpayFundAccount> {
    return this.request<RazorpayFundAccount>('POST', '/fund_accounts', {
      contact_id: input.contactId,
      account_type: 'bank_account',
      bank_account: {
        name: input.name,
        ifsc: input.ifsc,
        account_number: input.accountNumber,
      },
    });
  }

  createVpaFundAccount(input: {
    contactId: string;
    address: string;
  }): Promise<RazorpayFundAccount> {
    return this.request<RazorpayFundAccount>('POST', '/fund_accounts', {
      contact_id: input.contactId,
      account_type: 'vpa',
      vpa: {
        address: input.address,
      },
    });
  }

  createPayout(
    input: {
      accountNumber: string;
      fundAccountId: string;
      amountPaise: number;
      currency: string;
      mode: string;
      purpose: string;
      queueIfLowBalance: boolean;
      referenceId: string;
      narration: string;
      notes?: Record<string, unknown>;
    },
    idempotencyKey: string,
  ): Promise<RazorpayPayout> {
    return this.request<RazorpayPayout>(
      'POST',
      '/payouts',
      {
        account_number: input.accountNumber,
        fund_account_id: input.fundAccountId,
        amount: input.amountPaise,
        currency: input.currency,
        mode: input.mode,
        purpose: input.purpose,
        queue_if_low_balance: input.queueIfLowBalance,
        reference_id: input.referenceId,
        narration: input.narration,
        notes: input.notes ?? {},
      },
      {
        'X-Payout-Idempotency': idempotencyKey,
      },
      { useRazorpayXBaseUrl: true },
    );
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const secret = this.getRequiredConfig('RAZORPAY_WEBHOOK_SECRET');
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    return this.safeCompareHex(expected, signature);
  }

  verifyPaymentSignature(input: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): boolean {
    const secret = this.getRequiredConfig('RAZORPAY_KEY_SECRET');
    const expected = createHmac('sha256', secret)
      .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
      .digest('hex');
    return this.safeCompareHex(expected, input.razorpaySignature);
  }

  private safeCompareHex(expected: string, received: string): boolean {
    try {
      const expectedBuffer = Buffer.from(expected, 'hex');
      const receivedBuffer = Buffer.from(received, 'hex');

      if (expectedBuffer.length !== receivedBuffer.length) {
        return false;
      }

      return timingSafeEqual(expectedBuffer, receivedBuffer);
    } catch {
      return false;
    }
  }

  private async request<T>(
    method: RazorpayMethod,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
    options: { useRazorpayXBaseUrl?: boolean } = {},
  ): Promise<T> {
    const baseUrl = options.useRazorpayXBaseUrl
      ? this.getRazorpayXApiBaseUrl()
      : this.getApiBaseUrl();
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${this.getBasicAuthToken()}`,
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const text = await response.text();
    const parsed = this.parseResponseBody(text);
    if (!response.ok) {
      const razorpayError =
        typeof parsed === 'object' && parsed && 'error' in parsed
          ? (parsed as { error: unknown }).error
          : parsed;
      const detail = this.getRazorpayErrorMessage(razorpayError);
      throw new BadRequestException({
        message: detail
          ? `Razorpay request failed: ${detail}`
          : 'Razorpay request failed.',
        razorpayStatus: response.status,
        razorpayPath: path,
        razorpayError,
      });
    }

    return parsed as T;
  }

  private getApiBaseUrl(): string {
    return (
      this.configService.get<string>('RAZORPAY_API_BASE_URL') ||
      'https://api.razorpay.com/v1'
    ).replace(/\/+$/, '');
  }

  private getBasicAuthToken(): string {
    const keyId = this.getRequiredConfig('RAZORPAY_KEY_ID');
    const keySecret = this.getRequiredConfig('RAZORPAY_KEY_SECRET');
    return Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  }

  private getRequiredConfig(name: string): string {
    const value = this.configService.get<string>(name)?.trim();
    if (!value) {
      throw new InternalServerErrorException(`${name} is not configured.`);
    }
    return value;
  }

  private parseResponseBody(text: string): unknown {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private getRazorpayXApiBaseUrl(): string {
    return (
      this.configService.get<string>('RAZORPAYX_API_BASE_URL') ||
      this.getApiBaseUrl()
    ).replace(/\/+$/, '');
  }

  private getRazorpayErrorMessage(error: unknown): string | null {
    if (!error) return null;
    if (typeof error === 'string') return error;
    if (typeof error !== 'object') return null;

    const fields = error as Record<string, unknown>;
    const description =
      typeof fields.description === 'string' ? fields.description : null;
    const reason = typeof fields.reason === 'string' ? fields.reason : null;
    const code = typeof fields.code === 'string' ? fields.code : null;
    const field = typeof fields.field === 'string' ? fields.field : null;

    const message = [description, reason, code, field]
      .filter(Boolean)
      .join(' | ');

    if (
      description?.toLowerCase().includes('requested url was not found') &&
      code === 'BAD_REQUEST_ERROR'
    ) {
      return `${message}. Check RazorpayX/Payouts access for these API keys and RAZORPAYX_API_BASE_URL. Normal Payment Gateway keys without Payouts access cannot call /payouts.`;
    }

    return message;
  }
}
