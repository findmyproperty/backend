import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VendorLead, VendorLeadStatus } from './entities/vendor-lead.entity';
import { VendorLeadUpdate } from './entities/vendor-lead-update.entity';
import { PatchVendorLeadDto } from './dto/patch-vendor-lead.dto';
import { CreateVendorLeadUpdateDto } from './dto/create-vendor-lead-update.dto';
import { AdminCreateVendorLeadDto } from './dto/admin-create-vendor-lead.dto';
import { AdminPatchVendorLeadDto } from './dto/admin-patch-vendor-lead.dto';
import { ListVendorLeadsQueryDto } from './dto/list-vendor-leads.query.dto';
import { VendorsService } from '../vendors/vendors.service';
import { VendorWalletService } from '../vendor-wallet/vendor-wallet.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/entities/user.entity';
import {
  ServiceRequest,
  ServiceRequestStatus,
} from '../service-requests/entities/service-request.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

export interface VendorLeadUpdateResponse {
  id: number;
  milestone: string;
  note: string | null;
  photoUrls: string[] | null;
  createdAt: Date;
}

export interface VendorLeadResponse {
  id: number;
  vendorUserId: number;
  serviceRequestId: number | null;
  customerName: string;
  phone: string;
  area: string | null;
  budget: string | null;
  requirement: string | null;
  preferredDate: string | null;
  status: string;
  commissionPercent: number;
  jobAmount: number | null;
  createdAt: Date;
  updatedAt: Date;
  updates?: VendorLeadUpdateResponse[];
}

@Injectable()
export class VendorLeadsService {
  constructor(
    @InjectRepository(VendorLead)
    private readonly leadRepo: Repository<VendorLead>,
    @InjectRepository(VendorLeadUpdate)
    private readonly updateRepo: Repository<VendorLeadUpdate>,
    @InjectRepository(ServiceRequest)
    private readonly serviceRequestRepo: Repository<ServiceRequest>,
    private readonly vendorsService: VendorsService,
    private readonly walletService: VendorWalletService,
    private readonly usersService: UsersService,
    private readonly notifications: NotificationsService,
  ) {}

  private async notifyLead(
    vendorUserId: number,
    type: NotificationType,
    title: string,
    body: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.notifications.create({
      userId: vendorUserId,
      type,
      title,
      body,
      metadata: metadata ?? null,
    });
  }

  async findAllForVendor(vendorUserId: number): Promise<VendorLeadResponse[]> {
    const rows = await this.leadRepo.find({
      where: { vendorUserId },
      order: { updatedAt: 'DESC' },
    });
    return rows.map((r) => this.mapLead(r));
  }

  async findOneForVendor(
    id: number,
    vendorUserId: number,
  ): Promise<VendorLeadResponse> {
    const lead = await this.getOwnedLead(id, vendorUserId);
    const updates = await this.updateRepo.find({
      where: { vendorLeadId: id },
      order: { createdAt: 'ASC' },
    });
    return {
      ...this.mapLead(lead),
      updates: updates.map((u) => this.mapUpdate(u)),
    };
  }

  async patchForVendor(
    id: number,
    vendorUserId: number,
    dto: PatchVendorLeadDto,
  ): Promise<VendorLeadResponse> {
    const lead = await this.getOwnedLead(id, vendorUserId);
    const user = await this.usersService.findOne(vendorUserId);
    const profile =
      await this.vendorsService.ensureProfileForUser(vendorUserId);

    if (!dto.status) {
      throw new BadRequestException('status is required');
    }

    if (
      dto.status === VendorLeadStatus.ACCEPTED ||
      dto.status === VendorLeadStatus.REJECTED
    ) {
      if (lead.status !== VendorLeadStatus.NEW) {
        throw new BadRequestException(
          'Only new leads can be accepted or rejected',
        );
      }
      if (dto.status === VendorLeadStatus.ACCEPTED) {
        this.vendorsService.assertVendorCanOperate(profile, user);
      }
    } else if (dto.status === VendorLeadStatus.IN_PROGRESS) {
      if (lead.status !== VendorLeadStatus.ACCEPTED) {
        throw new BadRequestException('Lead must be accepted first');
      }
    } else if (dto.status === VendorLeadStatus.COMPLETED) {
      if (
        lead.status !== VendorLeadStatus.IN_PROGRESS &&
        lead.status !== VendorLeadStatus.ACCEPTED
      ) {
        throw new BadRequestException('Lead must be in progress to complete');
      }
    } else if (dto.status === VendorLeadStatus.NEW) {
      throw new BadRequestException('Cannot revert to new');
    }

    const prev = lead.status;
    lead.status = dto.status;
    const saved = await this.leadRepo.save(lead);
    await this.syncServiceRequestStatus(saved);
    if (prev !== saved.status) {
      await this.notifyLead(
        vendorUserId,
        NotificationType.VENDOR_LEAD_STATUS,
        'Lead status updated',
        `Lead #${saved.id} is now ${saved.status.replace('_', ' ')}`,
        { leadId: saved.id, status: saved.status },
      );
    }
    return this.mapLead(saved);
  }

  async addUpdate(
    id: number,
    vendorUserId: number,
    dto: CreateVendorLeadUpdateDto,
  ): Promise<VendorLeadUpdateResponse> {
    const lead = await this.getOwnedLead(id, vendorUserId);
    if (
      lead.status === VendorLeadStatus.REJECTED ||
      lead.status === VendorLeadStatus.NEW
    ) {
      throw new BadRequestException('Accept the lead before posting updates');
    }
    const row = this.updateRepo.create({
      vendorLeadId: id,
      milestone: dto.milestone,
      note: dto.note ?? null,
      photoUrls: dto.photoUrls ?? null,
    });
    const saved = await this.updateRepo.save(row);
    if (lead.status === VendorLeadStatus.ACCEPTED) {
      lead.status = VendorLeadStatus.IN_PROGRESS;
      const savedLead = await this.leadRepo.save(lead);
      await this.syncServiceRequestStatus(savedLead);
    }
    return this.mapUpdate(saved);
  }

  async adminList(query: ListVendorLeadsQueryDto): Promise<{
    items: VendorLeadResponse[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.leadRepo
      .createQueryBuilder('vl')
      .orderBy('vl.updatedAt', 'DESC');
    if (query.status) {
      qb.andWhere('vl.status = :st', { st: query.status });
    }
    qb.skip((page - 1) * limit).take(limit);
    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((r) => this.mapLead(r)),
      total,
      page,
      limit,
    };
  }

  async adminCreate(
    dto: AdminCreateVendorLeadDto,
  ): Promise<VendorLeadResponse> {
    const vendor = await this.usersService.findOne(dto.vendorUserId);
    if (vendor.role !== UserRole.VENDOR) {
      throw new BadRequestException('User is not a vendor');
    }
    const commissionPercent = await this.walletService.getCommissionPercent();
    const lead = this.leadRepo.create({
      vendorUserId: dto.vendorUserId,
      serviceRequestId: dto.serviceRequestId ?? null,
      customerName: dto.customerName,
      phone: dto.phone,
      area: dto.area ?? null,
      budget: dto.budget ?? null,
      requirement: dto.requirement ?? null,
      preferredDate: dto.preferredDate ?? null,
      status: VendorLeadStatus.NEW,
      commissionPercent,
    });
    const saved = await this.leadRepo.save(lead);
    await this.notifyLead(
      dto.vendorUserId,
      NotificationType.VENDOR_LEAD_ASSIGNED,
      'New lead assigned',
      `Customer: ${saved.customerName}${saved.area ? ` · ${saved.area}` : ''}`,
      { leadId: saved.id },
    );
    return this.mapLead(saved);
  }

  async adminPatch(
    id: number,
    dto: AdminPatchVendorLeadDto,
  ): Promise<VendorLeadResponse> {
    const lead = await this.leadRepo.findOneBy({ id });
    if (!lead) {
      throw new NotFoundException(`Vendor lead ${id} not found`);
    }
    if (dto.vendorUserId !== undefined) {
      lead.vendorUserId = dto.vendorUserId;
    }
    if (dto.status !== undefined) {
      lead.status = dto.status;
    }
    if (dto.jobAmount !== undefined) {
      lead.jobAmount = dto.jobAmount;
    }
    const saved = await this.leadRepo.save(lead);
    await this.syncServiceRequestStatus(saved);

    if (
      saved.status === VendorLeadStatus.COMPLETED &&
      saved.jobAmount != null &&
      Number(saved.jobAmount) > 0
    ) {
      await this.walletService.recordJobCompletion(
        saved.vendorUserId,
        saved.id,
        Number(saved.jobAmount),
        Number(saved.commissionPercent),
      );
    }

    return this.mapLead(saved);
  }

  async createFromServiceRequest(
    serviceRequestId: number,
    vendorUserId: number,
  ): Promise<VendorLeadResponse> {
    const sr = await this.serviceRequestRepo.findOneBy({
      id: serviceRequestId,
    });
    if (!sr) {
      throw new NotFoundException(
        `Service request ${serviceRequestId} not found`,
      );
    }
    const existing = await this.leadRepo.findOne({
      where: { serviceRequestId, vendorUserId },
    });
    if (existing) {
      return this.mapLead(existing);
    }
    const commissionPercent = await this.walletService.getCommissionPercent();
    const requirement =
      sr.details && typeof sr.details === 'object'
        ? JSON.stringify(sr.details).slice(0, 4000)
        : null;
    const lead = this.leadRepo.create({
      vendorUserId,
      serviceRequestId,
      customerName: sr.name,
      phone: sr.phone,
      area: sr.city ?? sr.addressLine ?? null,
      budget: null,
      requirement,
      preferredDate: sr.preferredDate,
      status: VendorLeadStatus.NEW,
      commissionPercent,
    });
    const saved = await this.leadRepo.save(lead);
    await this.syncServiceRequestStatus(saved);
    await this.notifyLead(
      vendorUserId,
      NotificationType.VENDOR_LEAD_ASSIGNED,
      'New lead assigned',
      `Customer: ${saved.customerName}`,
      { leadId: saved.id, serviceRequestId },
    );
    return this.mapLead(saved);
  }

  private async getOwnedLead(
    id: number,
    vendorUserId: number,
  ): Promise<VendorLead> {
    const lead = await this.leadRepo.findOneBy({ id });
    if (!lead) {
      throw new NotFoundException(`Vendor lead ${id} not found`);
    }
    if (lead.vendorUserId !== vendorUserId) {
      throw new ForbiddenException('Not your lead');
    }
    return lead;
  }

  private async syncServiceRequestStatus(lead: VendorLead): Promise<void> {
    if (lead.serviceRequestId == null) return;

    const serviceRequest = await this.serviceRequestRepo.findOneBy({
      id: lead.serviceRequestId,
    });
    if (!serviceRequest) return;

    const nextStatus = this.serviceRequestStatusForLead(lead.status);
    const shouldClearAssignedVendor =
      lead.status === VendorLeadStatus.REJECTED &&
      serviceRequest.assignedVendorUserId === lead.vendorUserId;
    if (serviceRequest.status === nextStatus && !shouldClearAssignedVendor) {
      return;
    }

    serviceRequest.status = nextStatus;
    if (shouldClearAssignedVendor) {
      serviceRequest.assignedVendorUserId = null;
    }
    await this.serviceRequestRepo.save(serviceRequest);
  }

  private serviceRequestStatusForLead(
    status: VendorLeadStatus,
  ): ServiceRequestStatus {
    if (status === VendorLeadStatus.COMPLETED) {
      return ServiceRequestStatus.COMPLETED;
    }
    if (
      status === VendorLeadStatus.ACCEPTED ||
      status === VendorLeadStatus.IN_PROGRESS
    ) {
      return ServiceRequestStatus.SCHEDULED;
    }
    if (status === VendorLeadStatus.REJECTED) {
      return ServiceRequestStatus.NEW;
    }
    return ServiceRequestStatus.CONTACTED;
  }

  private mapLead(lead: VendorLead): VendorLeadResponse {
    return {
      id: lead.id,
      vendorUserId: lead.vendorUserId,
      serviceRequestId: lead.serviceRequestId,
      customerName: lead.customerName,
      phone: lead.phone,
      area: lead.area,
      budget: lead.budget,
      requirement: lead.requirement,
      preferredDate: lead.preferredDate,
      status: lead.status,
      commissionPercent: Number(lead.commissionPercent),
      jobAmount: lead.jobAmount != null ? Number(lead.jobAmount) : null,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    };
  }

  private mapUpdate(u: VendorLeadUpdate): VendorLeadUpdateResponse {
    return {
      id: u.id,
      milestone: u.milestone,
      note: u.note,
      photoUrls: u.photoUrls,
      createdAt: u.createdAt,
    };
  }
}
