import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MaskedContactPair {
  virtualNumber: string;
}

/**
 * Phase 2: integrate Exotel / Knowlarity / Twilio Proxy for masked calls.
 * Phase 1: stub returns null — contactPhone stays unavailable.
 */
@Injectable()
export class TelephonyService {
  private readonly logger = new Logger(TelephonyService.name);

  constructor(private readonly configService: ConfigService) {}

  isEnabled(): boolean {
    return (
      this.configService.get<string>('TELEPHONY_PROVIDER', '').trim().length > 0
    );
  }

  async provisionMaskedPair(
    _leadId: number,
    _customerPhone: string,
    _vendorPhone: string,
  ): Promise<MaskedContactPair | null> {
    if (!this.isEnabled()) {
      return null;
    }
    this.logger.warn(
      'TELEPHONY_PROVIDER is set but masked calling is not implemented yet (Phase 2).',
    );
    return null;
  }

  async releaseMaskedPair(_leadId: number): Promise<void> {
    if (!this.isEnabled()) return;
    this.logger.debug(`releaseMaskedPair noop for lead #${_leadId}`);
  }
}
