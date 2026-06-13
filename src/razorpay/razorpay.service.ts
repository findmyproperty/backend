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
    );
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const secret = this.getRequiredConfig('RAZORPAY_WEBHOOK_SECRET');
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    const receivedBuffer = Buffer.from(signature, 'hex');

    if (expectedBuffer.length !== receivedBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, receivedBuffer);
  }

  private async request<T>(
    method: RazorpayMethod,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const response = await fetch(`${this.getApiBaseUrl()}${path}`, {
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
      throw new BadRequestException({
        message: 'Razorpay request failed.',
        razorpayStatus: response.status,
        razorpayError:
          typeof parsed === 'object' && parsed && 'error' in parsed
            ? (parsed as { error: unknown }).error
            : parsed,
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
}
