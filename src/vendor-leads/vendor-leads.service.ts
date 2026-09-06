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
import type { JobSettlementInitResponse } from '../vendor-wallet/vendor-wallet.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/entities/user.entity';
import {
  ServiceRequest,
  ServiceRequestStatus,
  ServiceType,
} from '../service-requests/entities/service-request.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { TelephonyService } from '../telephony/telephony.service';
import { VendorLeadsNotifier } from './vendor-leads.notifier';
import { CategoriesService } from '../categories/categories.service';

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
  phone?: string;
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
  settlement?: JobSettlementInitResponse;
  contactAvailable?: boolean;
  contactPhone?: string | null;
  maskedCallingEnabled?: boolean;
  adminApprovedAt?: Date | null;
  adminApprovedByUserId?: number | null;
  adminApprovalNotes?: string | null;
  adminRejectedAt?: Date | null;
  adminRejectedByUserId?: number | null;
  adminRejectionReason?: string | null;
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
    private readonly telephonyService: TelephonyService,
    private readonly vendorLeadsNotifier: VendorLeadsNotifier,
    private readonly categoriesService: CategoriesService,
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

  private canVendorAcceptOrReject(status: VendorLeadStatus): boolean {
    return (
      status === VendorLeadStatus.OPEN || status === VendorLeadStatus.NEW
    );
  }

  private isContactAvailable(lead: VendorLead): boolean {
    if (!lead.adminApprovedAt) return false;
    return (
      lead.status === VendorLeadStatus.ACCEPTED ||
      lead.status === VendorLeadStatus.IN_PROGRESS ||
      lead.status === VendorLeadStatus.COMPLETED
    );
  }

  async findAllForVendor(vendorUserId: number): Promise<VendorLeadResponse[]> {
    const rows = await this.leadRepo.find({
      where: { vendorUserId },
      order: { updatedAt: 'DESC' },
    });
    return Promise.all(rows.map((r) => this.mapLeadForVendor(r)));
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
      ...(await this.mapLeadForVendor(lead)),
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
      if (!this.canVendorAcceptOrReject(lead.status)) {
        throw new BadRequestException(
          'This lead is not open for accept or reject yet',
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
    } else if (
      dto.status === VendorLeadStatus.NEW ||
      dto.status === VendorLeadStatus.OPEN ||
      dto.status === VendorLeadStatus.PENDING_ADMIN_REVIEW ||
      dto.status === VendorLeadStatus.ADMIN_REJECTED
    ) {
      throw new BadRequestException('Invalid status transition');
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
        `Lead #${saved.id} is now ${saved.status.replace(/_/g, ' ')}`,
        { leadId: saved.id, status: saved.status },
      );
    }

    if (
      saved.status === VendorLeadStatus.ACCEPTED &&
      prev !== VendorLeadStatus.ACCEPTED
    ) {
      await this.provisionLeadMaskedContact(saved);
    }

    if (
      saved.status === VendorLeadStatus.COMPLETED ||
      saved.status === VendorLeadStatus.REJECTED
    ) {
      await this.telephonyService.releaseMaskedPair(saved.id);
    }

    return this.mapLeadForVendor(saved);
  }

  async callCustomerForVendor(
    leadId: number,
    vendorUserId: number,
  ): Promise<{ callSid: string; virtualNumber: string; message: string }> {
    const lead = await this.getOwnedLead(leadId, vendorUserId);
    if (!this.isContactAvailable(lead)) {
      throw new BadRequestException(
        'Customer contact is not available for this lead yet',
      );
    }

    const vendor = await this.usersService.findOne(vendorUserId);
    const vendorPhone = vendor.phone?.trim();
    if (!vendorPhone) {
      throw new BadRequestException(
        'Add a phone number to your profile before calling customers',
      );
    }

    await this.provisionLeadMaskedContact(lead);
    return this.telephonyService.initiateMaskedCall(
      lead.id,
      vendorPhone,
      lead.phone,
    );
  }

  private async provisionLeadMaskedContact(lead: VendorLead): Promise<void> {
    if (!this.telephonyService.isEnabled()) return;

    const vendor = await this.usersService.findOne(lead.vendorUserId);
    const vendorPhone = vendor.phone?.trim();
    if (!vendorPhone) return;

    await this.telephonyService.provisionMaskedPair(
      lead.id,
      lead.phone,
      vendorPhone,
    );
  }

  async addUpdate(
    id: number,
    vendorUserId: number,
    dto: CreateVendorLeadUpdateDto,
  ): Promise<VendorLeadUpdateResponse> {
    const lead = await this.getOwnedLead(id, vendorUserId);
    if (
      lead.status === VendorLeadStatus.REJECTED ||
      lead.status === VendorLeadStatus.ADMIN_REJECTED ||
      lead.status === VendorLeadStatus.PENDING_ADMIN_REVIEW ||
      lead.status === VendorLeadStatus.OPEN ||
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
    if (query.serviceRequestId) {
      qb.andWhere('vl.serviceRequestId = :srId', {
        srId: query.serviceRequestId,
      });
    }
    qb.skip((page - 1) * limit).take(limit);
    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((r) => this.mapLeadForAdmin(r)),
      total,
      page,
      limit,
    };
  }

  async adminFindOne(id: number): Promise<VendorLeadResponse> {
    const lead = await this.leadRepo.findOneBy({ id });
    if (!lead) {
      throw new NotFoundException(`Vendor lead ${id} not found`);
    }
    const updates = await this.updateRepo.find({
      where: { vendorLeadId: id },
      order: { createdAt: 'ASC' },
    });
    return {
      ...this.mapLeadForAdmin(lead),
      updates: updates.map((u) => this.mapUpdate(u)),
    };
  }

  async adminApproveLead(
    id: number,
    adminUserId: number,
    notes?: string,
  ): Promise<VendorLeadResponse> {
    const lead = await this.leadRepo.findOneBy({ id });
    if (!lead) {
      throw new NotFoundException(`Vendor lead ${id} not found`);
    }
    if (lead.status !== VendorLeadStatus.PENDING_ADMIN_REVIEW) {
      throw new BadRequestException(
        'Only leads awaiting admin review can be approved',
      );
    }

    lead.status = VendorLeadStatus.OPEN;
    lead.adminApprovedAt = new Date();
    lead.adminApprovedByUserId = adminUserId;
    lead.adminApprovalNotes = notes?.trim() || null;
    lead.adminRejectedAt = null;
    lead.adminRejectedByUserId = null;
    lead.adminRejectionReason = null;

    const saved = await this.leadRepo.save(lead);
    await this.syncServiceRequestStatus(saved);
    await this.notifyLead(
      saved.vendorUserId,
      NotificationType.VENDOR_LEAD_ASSIGNED,
      'Lead ready for you',
      `Lead #${saved.id} for ${saved.customerName} is approved. Accept or reject when ready.`,
      { leadId: saved.id, serviceRequestId: saved.serviceRequestId },
    );

    return this.mapLeadForAdmin(saved);
  }

  async adminRejectLead(
    id: number,
    adminUserId: number,
    reason: string,
  ): Promise<VendorLeadResponse> {
    const lead = await this.leadRepo.findOneBy({ id });
    if (!lead) {
      throw new NotFoundException(`Vendor lead ${id} not found`);
    }
    if (lead.status !== VendorLeadStatus.PENDING_ADMIN_REVIEW) {
      throw new BadRequestException(
        'Only leads awaiting admin review can be rejected',
      );
    }

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      throw new BadRequestException('Rejection reason is required');
    }

    lead.status = VendorLeadStatus.ADMIN_REJECTED;
    lead.adminRejectedAt = new Date();
    lead.adminRejectedByUserId = adminUserId;
    lead.adminRejectionReason = trimmedReason;
    lead.adminApprovedAt = null;
    lead.adminApprovedByUserId = null;
    lead.adminApprovalNotes = null;

    const saved = await this.leadRepo.save(lead);
    await this.syncServiceRequestStatus(saved);
    await this.notifyLead(
      saved.vendorUserId,
      NotificationType.VENDOR_LEAD_STATUS,
      'Lead not released',
      `Lead #${saved.id} was not approved for vendor action.`,
      { leadId: saved.id, status: saved.status },
    );

    return this.mapLeadForAdmin(saved);
  }

  async adminCreate(
    dto: AdminCreateVendorLeadDto,
  ): Promise<VendorLeadResponse> {
    const vendor = await this.usersService.findOne(dto.vendorUserId);
    if (vendor.role !== UserRole.VENDOR) {
      throw new BadRequestException('User is not a vendor');
    }
    let linkedRequest: ServiceRequest | null = null;
    if (dto.serviceRequestId != null) {
      linkedRequest = await this.serviceRequestRepo.findOneBy({
        id: dto.serviceRequestId,
      });
    }
    const commissionPercent =
      await this.resolveCommissionPercent(linkedRequest);
    const lead = this.leadRepo.create({
      vendorUserId: dto.vendorUserId,
      serviceRequestId: dto.serviceRequestId ?? null,
      customerName: dto.customerName,
      phone: dto.phone,
      area: dto.area ?? null,
      budget: dto.budget ?? null,
      requirement: dto.requirement ?? null,
      preferredDate: dto.preferredDate ?? null,
      status: VendorLeadStatus.PENDING_ADMIN_REVIEW,
      commissionPercent,
    });
    const saved = await this.leadRepo.save(lead);
    await this.notifyLead(
      dto.vendorUserId,
      NotificationType.VENDOR_LEAD_ASSIGNED,
      'Lead assigned — awaiting admin approval',
      `Customer: ${saved.customerName}${saved.area ? ` · ${saved.area}` : ''}. You will be able to accept or reject after admin approval.`,
      { leadId: saved.id },
    );
    await this.notifyAdminsOfPendingLead(saved);
    return this.mapLeadForAdmin(saved);
  }

  async adminPatch(
    id: number,
    dto: AdminPatchVendorLeadDto,
    adminUserId: number,
  ): Promise<VendorLeadResponse> {
    const lead = await this.leadRepo.findOneBy({ id });
    if (!lead) {
      throw new NotFoundException(`Vendor lead ${id} not found`);
    }
    if (dto.vendorUserId !== undefined) {
      lead.vendorUserId = dto.vendorUserId;
    }
    if (dto.status !== undefined) {
      this.assertAdminStatusTransition(lead.status, dto.status);
      lead.status = dto.status;
    }
    if (dto.jobAmount !== undefined) {
      lead.jobAmount = dto.jobAmount;
    }
    const saved = await this.leadRepo.save(lead);
    await this.syncServiceRequestStatus(saved);

    if (
      saved.status === VendorLeadStatus.COMPLETED ||
      saved.status === VendorLeadStatus.REJECTED
    ) {
      await this.telephonyService.releaseMaskedPair(saved.id);
    }

    let settlement: JobSettlementInitResponse | undefined;
    if (
      saved.status === VendorLeadStatus.COMPLETED &&
      saved.jobAmount != null &&
      Number(saved.jobAmount) > 0
    ) {
      settlement = await this.walletService.initiateJobSettlement(
        adminUserId,
        saved.vendorUserId,
        saved.id,
        Number(saved.jobAmount),
        Number(saved.commissionPercent),
      );
    }

    return { ...this.mapLeadForAdmin(saved), settlement };
  }

  private assertAdminStatusTransition(
    current: VendorLeadStatus,
    next: VendorLeadStatus,
  ): void {
    if (current === next) return;

    const vendorActionStatuses = [
      VendorLeadStatus.ACCEPTED,
      VendorLeadStatus.REJECTED,
      VendorLeadStatus.IN_PROGRESS,
      VendorLeadStatus.COMPLETED,
    ];

    if (
      current === VendorLeadStatus.PENDING_ADMIN_REVIEW &&
      vendorActionStatuses.includes(next)
    ) {
      throw new BadRequestException(
        'Approve the lead before setting vendor workflow statuses',
      );
    }

    if (
      current === VendorLeadStatus.ADMIN_REJECTED &&
      vendorActionStatuses.includes(next)
    ) {
      throw new BadRequestException(
        'Admin-rejected leads cannot move to vendor workflow statuses',
      );
    }
  }

  async adminReopenSettlement(
    id: number,
    reason: string,
    adminUserId: number,
  ): Promise<VendorLeadResponse & { reopen: { message: string } }> {
    const lead = await this.leadRepo.findOneBy({ id });
    if (!lead) {
      throw new NotFoundException(`Vendor lead ${id} not found`);
    }
    if (
      lead.status !== VendorLeadStatus.COMPLETED ||
      lead.jobAmount == null ||
      Number(lead.jobAmount) <= 0
    ) {
      throw new BadRequestException(
        'Only completed leads with a job amount can have settlement adjusted.',
      );
    }

    const reopen = await this.walletService.reopenJobSettlement(
      id,
      reason,
      adminUserId,
    );

    return { ...this.mapLeadForAdmin(lead), reopen };
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
      return this.mapLeadForAdmin(existing);
    }
    const commissionPercent = await this.resolveCommissionPercent(sr);
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
      status: VendorLeadStatus.PENDING_ADMIN_REVIEW,
      commissionPercent,
    });
    const saved = await this.leadRepo.save(lead);
    await this.syncServiceRequestStatus(saved);
    await this.notifyLead(
      vendorUserId,
      NotificationType.VENDOR_LEAD_ASSIGNED,
      'Lead assigned — awaiting admin approval',
      `Customer: ${saved.customerName}. You can accept or reject after admin approves this lead.`,
      { leadId: saved.id, serviceRequestId },
    );
    await this.notifyAdminsOfPendingLead(saved);
    return this.mapLeadForAdmin(saved);
  }

  private async notifyAdminsOfPendingLead(lead: VendorLead): Promise<void> {
    const profile = await this.vendorsService.ensureProfileForUser(
      lead.vendorUserId,
    );
    const vendor = await this.usersService.findOne(lead.vendorUserId);
    const vendorLabel =
      profile.businessName?.trim() ||
      vendor.name?.trim() ||
      `Vendor #${lead.vendorUserId}`;
    this.vendorLeadsNotifier.notifyAdminsOfPendingApproval(lead, vendorLabel);
  }

  /** Snapshot commission from the SR subtype's mapped category; else 0. */
  private async resolveCommissionPercent(
    serviceRequest: ServiceRequest | null | undefined,
  ): Promise<number> {
    if (!serviceRequest) return 0;

    const subtype = this.extractSubtypeFromServiceRequest(serviceRequest);
    if (!subtype) return 0;

    const category = await this.categoriesService.findByServiceAndSubtype(
      serviceRequest.serviceType,
      subtype,
    );
    if (!category) return 0;

    const pct = Number(category.commissionPercent);
    return Number.isFinite(pct) && pct >= 0 ? pct : 0;
  }

  private extractSubtypeFromServiceRequest(
    serviceRequest: ServiceRequest,
  ): string | null {
    const details = serviceRequest.details;
    if (!details || typeof details !== 'object') return null;

    const d = details as unknown as Record<string, unknown>;
    const pick = (key: string): string | null => {
      const value = d[key];
      return typeof value === 'string' && value.trim() ? value.trim() : null;
    };

    switch (serviceRequest.serviceType) {
      case ServiceType.PACKERS_MOVERS:
        return pick('moveType');
      case ServiceType.EVENT_MANAGEMENT:
        return pick('eventType');
      case ServiceType.PAINTING_CLEANING:
      case ServiceType.HOME_SERVICES:
      case ServiceType.IT:
      case ServiceType.GENERAL:
        return pick('subType');
      default:
        return pick('subType') ?? pick('moveType') ?? pick('eventType');
    }
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
      (lead.status === VendorLeadStatus.REJECTED ||
        lead.status === VendorLeadStatus.ADMIN_REJECTED) &&
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
    if (
      status === VendorLeadStatus.REJECTED ||
      status === VendorLeadStatus.ADMIN_REJECTED
    ) {
      return ServiceRequestStatus.NEW;
    }
    return ServiceRequestStatus.CONTACTED;
  }

  private mapLeadForAdmin(lead: VendorLead): VendorLeadResponse {
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
      adminApprovedAt: lead.adminApprovedAt,
      adminApprovedByUserId: lead.adminApprovedByUserId,
      adminApprovalNotes: lead.adminApprovalNotes,
      adminRejectedAt: lead.adminRejectedAt,
      adminRejectedByUserId: lead.adminRejectedByUserId,
      adminRejectionReason: lead.adminRejectionReason,
    };
  }

  private async mapLeadForVendor(lead: VendorLead): Promise<VendorLeadResponse> {
    const contactAvailable = this.isContactAvailable(lead);
    const maskedCallingEnabled =
      contactAvailable && this.telephonyService.isEnabled();
    const contactPhone = maskedCallingEnabled
      ? await this.telephonyService.getVirtualNumberForLead(lead.id)
      : null;

    return {
      id: lead.id,
      vendorUserId: lead.vendorUserId,
      serviceRequestId: lead.serviceRequestId,
      customerName: lead.customerName,
      area: lead.area,
      budget: lead.budget,
      requirement: lead.requirement,
      preferredDate: lead.preferredDate,
      status: lead.status,
      commissionPercent: Number(lead.commissionPercent),
      jobAmount: lead.jobAmount != null ? Number(lead.jobAmount) : null,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
      contactAvailable,
      contactPhone,
      maskedCallingEnabled,
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
