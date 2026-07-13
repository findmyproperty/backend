import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VendorLeadMaskedContact } from './entities/vendor-lead-masked-contact.entity';
import {
  ExotelClient,
  formatVirtualNumberForDisplay,
  normalizeExotelPhone,
} from './exotel.client';

export interface MaskedContactPair {
  virtualNumber: string;
}

export interface InitiateMaskedCallResult {
  callSid: string;
  virtualNumber: string;
  message: string;
}

@Injectable()
export class TelephonyService {
  private readonly logger = new Logger(TelephonyService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(VendorLeadMaskedContact)
    private readonly maskedContactRepo: Repository<VendorLeadMaskedContact>,
  ) {}

  isEnabled(): boolean {
    return this.getProvider() === 'exotel' && this.getExotelClient() != null;
  }

  private getProvider(): string {
    return this.configService.get<string>('TELEPHONY_PROVIDER', '').trim().toLowerCase();
  }

  private getExotelClient(): ExotelClient | null {
    const apiKey = this.configService.get<string>('EXOTEL_API_KEY')?.trim();
    const apiToken = this.configService.get<string>('EXOTEL_API_TOKEN')?.trim();
    const accountSid = this.configService.get<string>('EXOTEL_SID')?.trim();
    const callerId = this.configService.get<string>('EXOTEL_CALLER_ID')?.trim();

    if (!apiKey || !apiToken || !accountSid || !callerId) {
      return null;
    }

    const apiBaseUrl =
      this.configService.get<string>('EXOTEL_API_BASE_URL')?.trim() ||
      'https://api.in.exotel.com';

    return new ExotelClient(apiKey, apiToken, accountSid, apiBaseUrl.replace(/\/+$/, ''));
  }

  private getVirtualNumberRaw(): string {
    const callerId = this.configService.get<string>('EXOTEL_CALLER_ID')?.trim();
    if (!callerId) {
      throw new ServiceUnavailableException('Exotel caller ID is not configured');
    }
    return callerId;
  }

  async getVirtualNumberForLead(leadId: number): Promise<string | null> {
    const row = await this.maskedContactRepo.findOne({
      where: { vendorLeadId: leadId },
    });
    if (!row || row.releasedAt) return null;
    return formatVirtualNumberForDisplay(row.virtualNumber);
  }

  async provisionMaskedPair(
    leadId: number,
    customerPhone: string,
    vendorPhone: string,
  ): Promise<MaskedContactPair | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const normalizedCustomer = normalizeExotelPhone(customerPhone);
    const normalizedVendor = normalizeExotelPhone(vendorPhone);
    if (!normalizedCustomer || !normalizedVendor) {
      throw new BadRequestException('Valid customer and vendor phone numbers are required');
    }

    const virtualNumber = this.getVirtualNumberRaw();
    const existing = await this.maskedContactRepo.findOne({
      where: { vendorLeadId: leadId },
    });

    if (existing && !existing.releasedAt) {
      existing.customerPhone = normalizedCustomer;
      existing.vendorPhone = normalizedVendor;
      existing.virtualNumber = virtualNumber;
      await this.maskedContactRepo.save(existing);
      return { virtualNumber: formatVirtualNumberForDisplay(virtualNumber) };
    }

    if (existing?.releasedAt) {
      existing.customerPhone = normalizedCustomer;
      existing.vendorPhone = normalizedVendor;
      existing.virtualNumber = virtualNumber;
      existing.releasedAt = null;
      existing.lastCallSid = null;
      await this.maskedContactRepo.save(existing);
      return { virtualNumber: formatVirtualNumberForDisplay(virtualNumber) };
    }

    const created = this.maskedContactRepo.create({
      vendorLeadId: leadId,
      virtualNumber,
      customerPhone: normalizedCustomer,
      vendorPhone: normalizedVendor,
      lastCallSid: null,
      releasedAt: null,
    });
    await this.maskedContactRepo.save(created);

    this.logger.log(`Provisioned masked contact for vendor lead #${leadId}`);
    return { virtualNumber: formatVirtualNumberForDisplay(virtualNumber) };
  }

  async initiateMaskedCall(
    leadId: number,
    vendorPhone: string,
    customerPhone: string,
  ): Promise<InitiateMaskedCallResult> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('Masked calling is not configured');
    }

    const client = this.getExotelClient();
    if (!client) {
      throw new ServiceUnavailableException('Exotel credentials are incomplete');
    }

    const from = normalizeExotelPhone(vendorPhone);
    const to = normalizeExotelPhone(customerPhone);
    const callerId = this.getVirtualNumberRaw();

    const statusCallback = this.configService
      .get<string>('EXOTEL_STATUS_CALLBACK_URL')
      ?.trim();

    const result = await client.connectTwoNumbers({
      from,
      to,
      callerId,
      customField: `vendor_lead_${leadId}`,
      statusCallback: statusCallback || undefined,
    });

    let row = await this.maskedContactRepo.findOne({
      where: { vendorLeadId: leadId },
    });
    if (!row) {
      row = this.maskedContactRepo.create({
        vendorLeadId: leadId,
        virtualNumber: callerId,
        customerPhone: to,
        vendorPhone: from,
        lastCallSid: result.callSid,
        releasedAt: null,
      });
    } else {
      row.customerPhone = to;
      row.vendorPhone = from;
      row.virtualNumber = callerId;
      row.lastCallSid = result.callSid;
      row.releasedAt = null;
    }
    await this.maskedContactRepo.save(row);

    return {
      callSid: result.callSid,
      virtualNumber: formatVirtualNumberForDisplay(callerId),
      message:
        'We are calling your phone now. When you answer, you will be connected to the customer. Both parties see the secure line number.',
    };
  }

  async releaseMaskedPair(leadId: number): Promise<void> {
    const row = await this.maskedContactRepo.findOne({
      where: { vendorLeadId: leadId },
    });
    if (!row || row.releasedAt) return;

    row.releasedAt = new Date();
    await this.maskedContactRepo.save(row);
    this.logger.log(`Released masked contact for vendor lead #${leadId}`);
  }
}
