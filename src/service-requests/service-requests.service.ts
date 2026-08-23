import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import {
  PackersMoversDetails,
  ServiceRequest,
  ServiceRequestStatus,
  ServiceType,
} from './entities/service-request.entity';
import { BaseServiceRequestDto } from './dto/base-service-request.dto';
import { CreatePackersMoversDto } from './dto/create-packers-movers.dto';
import { CreatePaintingCleaningDto } from './dto/create-painting-cleaning.dto';
import { CreateHomeServicesDto } from './dto/create-home-services.dto';
import { CreateItServicesDto } from './dto/create-it-services.dto';
import { CreateGeneralServicesDto } from './dto/create-general-services.dto';
import { CreateEventManagementDto } from './dto/create-event-management.dto';
import { UpdateServiceRequestDto } from './dto/update-service-request.dto';
import { SubmitServiceRequestFeedbackDto } from './dto/submit-service-request-feedback.dto';
import { ListServiceRequestsQueryDto } from './dto/list-service-requests.query.dto';
import { ServiceRequestsNotifier } from './service-requests.notifier';
import { DistanceService } from './distance.service';
import { VendorLeadsService } from '../vendor-leads/vendor-leads.service';
import { VendorsService } from '../vendors/vendors.service';
import { SettingsService } from '../settings/settings.service';

export interface CustomerReactionResponse {
  id: number;
  /** First name only — used on the public landing page. */
  name: string;
  /** Full customer name — included in admin responses. */
  fullName: string;
  /** Human-readable service label e.g. "Packers & Movers". */
  service: string;
  /** Raw service type enum value e.g. "packers_movers". */
  serviceType: string;
  /** Vendor profile ID (vendor_profiles.id) — null if unassigned. */
  vendorId: number | null;
  /** Vendor business name — null if unassigned or not set. */
  vendorName: string | null;
  rating: number;
  feedback: string | null;
  reviewedAt: Date;
}

export interface ServiceRequestResponse {
  id: number;
  serviceType: ServiceType;
  status: ServiceRequestStatus;
  userId: number | null;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  addressLine: string | null;
  pincode: string | null;
  preferredDate: string | null;
  preferredSlot: string | null;
  details: ServiceRequest['details'];
  internalNotes: string | null;
  assignedAdminId: number | null;
  assignedVendorUserId: number | null;
  customerRating: number | null;
  customerFeedback: string | null;
  customerReviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PagedServiceRequests {
  items: ServiceRequestResponse[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class ServiceRequestsService {
  constructor(
    @InjectRepository(ServiceRequest)
    private readonly repo: Repository<ServiceRequest>,
    private readonly notifier: ServiceRequestsNotifier,
    private readonly distance: DistanceService,
    private readonly vendorLeadsService: VendorLeadsService,
    private readonly vendorsService: VendorsService,
    private readonly settingsService: SettingsService,
  ) {}

  async getCustomerReactions(): Promise<CustomerReactionResponse[]> {
    const settings = await this.settingsService.getSettings();
    const selectedIds = Array.isArray(settings.landingReactionIds)
      ? settings.landingReactionIds.filter((id) => Number.isInteger(Number(id)))
      : [];
    if (selectedIds.length === 0) return [];

    return this.mapCustomerReactions(
      await this.repo
      .createQueryBuilder('sr')
      .select([
        'sr.id AS id',
        'sr.name AS name',
        'sr.serviceType AS serviceType',
        'sr.customerRating AS rating',
        'sr.customerFeedback AS feedback',
        'sr.customerReviewedAt AS reviewedAt',
      ])
      .where('sr.status = :status', { status: ServiceRequestStatus.COMPLETED })
      .andWhere('sr.customerRating IS NOT NULL')
      .andWhere('sr.customerReviewedAt IS NOT NULL')
      .andWhere('sr.id IN (:...selectedIds)', { selectedIds })
      .orderBy('sr.customerRating', 'DESC')
      .addOrderBy('sr.customerReviewedAt', 'DESC')
      .getRawMany<{
        id: number | string;
        name: string;
        serviceType: ServiceType;
        rating: number | string;
        feedback: string | null;
        reviewedAt: Date;
      }>(),
    );
  }

  async adminCustomerReactions(): Promise<CustomerReactionResponse[]> {
    return this.mapCustomerReactions(
      await this.repo
        .createQueryBuilder('sr')
        .select([
          'sr.id AS id',
          'sr.name AS name',
          'sr.serviceType AS serviceType',
          'sr.customerRating AS rating',
          'sr.customerFeedback AS feedback',
          'sr.customerReviewedAt AS reviewedAt',
          'vp.id AS vendorId',
          'vp.businessName AS vendorName',
        ])
        .leftJoin('vendor_profiles', 'vp', 'vp.userId = sr.assignedVendorUserId')
        .where('sr.status = :status', { status: ServiceRequestStatus.COMPLETED })
        .andWhere('sr.customerRating IS NOT NULL')
        .andWhere('sr.customerReviewedAt IS NOT NULL')
        .orderBy('sr.customerRating', 'DESC')
        .addOrderBy('sr.customerReviewedAt', 'DESC')
        .getRawMany<{
          id: number | string;
          name: string;
          serviceType: ServiceType;
          rating: number | string;
          feedback: string | null;
          reviewedAt: Date;
          vendorId: number | string | null;
          vendorName: string | null;
        }>(),
    );
  }


  private mapCustomerReactions(
    rows: Array<{
      id: number | string;
      name: string;
      serviceType: ServiceType;
      rating: number | string;
      feedback: string | null;
      reviewedAt: Date;
      vendorId?: number | string | null;
      vendorName?: string | null;
    }>,
  ): CustomerReactionResponse[] {

    const serviceLabels: Record<ServiceType, string> = {
      [ServiceType.PACKERS_MOVERS]: 'Packers & Movers',
      [ServiceType.PAINTING_CLEANING]: 'Painting & Cleaning',
      [ServiceType.HOME_SERVICES]: 'Home Services',
      [ServiceType.EVENT_MANAGEMENT]: 'Event Management',
      [ServiceType.IT]: 'IT Services',
      [ServiceType.GENERAL]: 'General Services',
    };

    return rows.map((row) => ({
      id: Number(row.id),
      name: row.name.trim().split(/\s+/)[0] || 'Customer',
      fullName: row.name.trim() || 'Customer',
      service: serviceLabels[row.serviceType] ?? 'Service support',
      serviceType: row.serviceType,
      vendorId: row.vendorId != null ? Number(row.vendorId) : null,
      vendorName: row.vendorName?.trim() || null,
      rating: Math.min(5, Math.max(1, Number(row.rating))),
      feedback: row.feedback?.trim() || null,
      reviewedAt: row.reviewedAt,
    }));
  }


  async createPackersMovers(
    dto: CreatePackersMoversDto,
    userId: number | null,
  ): Promise<ServiceRequestResponse> {
    const details: PackersMoversDetails = { ...dto.details };
    // Compute authoritative trip summary server-side (ignores any client value)
    // so admin-facing distance/time is always trustworthy.
    if (details.pickup && details.drops?.length) {
      const trip = await this.distance.estimateForStops(
        details.pickup,
        details.drops,
      );
      if (trip) {
        details.trip = trip;
        details.distanceKm = trip.distanceKm;
      }
    }
    return this.create(ServiceType.PACKERS_MOVERS, dto, details, userId);
  }

  async createPaintingCleaning(
    dto: CreatePaintingCleaningDto,
    userId: number | null,
  ): Promise<ServiceRequestResponse> {
    return this.create(ServiceType.PAINTING_CLEANING, dto, dto.details, userId);
  }

  async createHomeServices(
    dto: CreateHomeServicesDto,
    userId: number | null,
  ): Promise<ServiceRequestResponse> {
    return this.create(ServiceType.HOME_SERVICES, dto, dto.details, userId);
  }

  async createItServices(
    dto: CreateItServicesDto,
    userId: number | null,
  ): Promise<ServiceRequestResponse> {
    return this.create(ServiceType.IT, dto, dto.details, userId);
  }

  async createGeneralServices(
    dto: CreateGeneralServicesDto,
    userId: number | null,
  ): Promise<ServiceRequestResponse> {
    return this.create(ServiceType.GENERAL, dto, dto.details, userId);
  }

  async createEventManagement(
    dto: CreateEventManagementDto,
    userId: number | null,
  ): Promise<ServiceRequestResponse> {
    return this.create(ServiceType.EVENT_MANAGEMENT, dto, dto.details, userId);
  }

  private async create(
    serviceType: ServiceType,
    base: BaseServiceRequestDto,
    details: ServiceRequest['details'],
    userId: number | null,
  ): Promise<ServiceRequestResponse> {
    const assignedVendorUserId = await this.vendorsService.resolveSelectableVendorUserId(
      base.assignedVendorUserId,
      serviceType,
    );
    const entity = this.repo.create({
      serviceType,
      status: assignedVendorUserId
        ? ServiceRequestStatus.CONTACTED
        : ServiceRequestStatus.NEW,
      userId: userId ?? null,
      name: base.name.trim(),
      phone: base.phone.trim(),
      email: base.email?.trim() || null,
      city: base.city?.trim() || null,
      addressLine: base.addressLine?.trim() || null,
      pincode: base.pincode?.trim() || null,
      preferredDate: base.preferredDate?.trim() || null,
      preferredSlot: base.preferredSlot ?? null,
      details: details ?? null,
      internalNotes: null,
      assignedAdminId: null,
      assignedVendorUserId,
    });
    const saved = await this.repo.save(entity);
    if (saved.assignedVendorUserId != null) {
      await this.vendorLeadsService.createFromServiceRequest(
        saved.id,
        saved.assignedVendorUserId,
      );
    }
    this.notifier.notifyAdminsOfNewRequest(saved);
    return this.map(saved);
  }

  async findMine(userId: number): Promise<ServiceRequestResponse[]> {
    const rows = await this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => this.map(r));
  }

  async submitFeedback(
    id: number,
    userId: number,
    dto: SubmitServiceRequestFeedbackDto,
  ): Promise<ServiceRequestResponse> {
    const row = await this.repo.findOneBy({ id });
    if (!row) {
      throw new NotFoundException(`Service request ${id} not found`);
    }
    if (row.userId !== userId) {
      throw new ForbiddenException('Not your service request');
    }
    if (row.status !== ServiceRequestStatus.COMPLETED) {
      throw new BadRequestException(
        'Feedback is only allowed after the service is completed.',
      );
    }
    if (row.customerReviewedAt != null || row.customerRating != null) {
      throw new ConflictException('Feedback has already been submitted.');
    }

    const feedback = dto.feedback?.trim() || null;
    row.customerRating = dto.rating;
    row.customerFeedback = feedback;
    row.customerReviewedAt = new Date();

    const saved = await this.repo.save(row);
    return this.map(saved);
  }

  async adminList(
    query: ListServiceRequestsQueryDto,
  ): Promise<PagedServiceRequests> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const qb = this.repo
      .createQueryBuilder('sr')
      .orderBy('sr.createdAt', 'DESC');
    if (query.serviceType) {
      qb.andWhere('sr.serviceType = :t', { t: query.serviceType });
    }
    if (query.status) {
      qb.andWhere('sr.status = :s', { s: query.status });
    }
    const search = query.q?.trim();
    if (search) {
      qb.andWhere(
        new Brackets((b) => {
          b.where('sr.name LIKE :q', { q: `%${search}%` }).orWhere(
            'sr.phone LIKE :q',
            { q: `%${search}%` },
          );
        }),
      );
    }
    qb.skip((page - 1) * limit).take(limit);
    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((r) => this.map(r)),
      total,
      page,
      limit,
    };
  }

  async adminFindOne(id: number): Promise<ServiceRequestResponse> {
    const row = await this.repo.findOneBy({ id });
    if (!row) {
      throw new NotFoundException(`Service request ${id} not found`);
    }
    return this.map(row);
  }

  async adminUpdate(
    id: number,
    dto: UpdateServiceRequestDto,
  ): Promise<ServiceRequestResponse> {
    const row = await this.repo.findOneBy({ id });
    if (!row) {
      throw new NotFoundException(`Service request ${id} not found`);
    }
    const previousStatus = row.status;
    const previousVendorUserId = row.assignedVendorUserId;
    if (dto.status !== undefined) row.status = dto.status;
    if (dto.internalNotes !== undefined) row.internalNotes = dto.internalNotes;
    if (dto.assignedAdminId !== undefined)
      row.assignedAdminId = dto.assignedAdminId ?? null;
    if (dto.assignedVendorUserId !== undefined) {
      row.assignedVendorUserId = dto.assignedVendorUserId ?? null;
      if (dto.status === undefined) {
        row.status =
          row.assignedVendorUserId == null
            ? ServiceRequestStatus.NEW
            : ServiceRequestStatus.CONTACTED;
      }
    }

    const saved = await this.repo.save(row);
    if (saved.assignedVendorUserId != null) {
      await this.vendorLeadsService.createFromServiceRequest(
        saved.id,
        saved.assignedVendorUserId,
      );
    }
    if (dto.emailNotifications?.enabled) {
      this.notifier.notifyConfiguredUpdate(saved, {
        previousStatus,
        previousVendorUserId,
        config: dto.emailNotifications,
      });
    } else if (
      dto.status !== undefined &&
      previousStatus !== saved.status
    ) {
      this.notifier.notifyStatusChange(saved, previousStatus);
    }
    return this.map(saved);
  }

  async adminStats(): Promise<{
    byType: Record<ServiceType, Record<ServiceRequestStatus, number>>;
    totals: Record<ServiceType, number>;
    openTotal: number;
  }> {
    const rows = await this.repo
      .createQueryBuilder('sr')
      .select('sr.serviceType', 'serviceType')
      .addSelect('sr.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('sr.serviceType')
      .addGroupBy('sr.status')
      .getRawMany<{
        serviceType: ServiceType;
        status: ServiceRequestStatus;
        count: string;
      }>();

    const byType = {
      [ServiceType.PACKERS_MOVERS]: this.emptyStatusMap(),
      [ServiceType.PAINTING_CLEANING]: this.emptyStatusMap(),
      [ServiceType.HOME_SERVICES]: this.emptyStatusMap(),
      [ServiceType.EVENT_MANAGEMENT]: this.emptyStatusMap(),
      [ServiceType.IT]: this.emptyStatusMap(),
      [ServiceType.GENERAL]: this.emptyStatusMap(),
    } as Record<ServiceType, Record<ServiceRequestStatus, number>>;

    const totals: Record<ServiceType, number> = {
      [ServiceType.PACKERS_MOVERS]: 0,
      [ServiceType.PAINTING_CLEANING]: 0,
      [ServiceType.HOME_SERVICES]: 0,
      [ServiceType.EVENT_MANAGEMENT]: 0,
      [ServiceType.IT]: 0,
      [ServiceType.GENERAL]: 0,
    };
    let openTotal = 0;

    for (const r of rows) {
      const n = Number(r.count) || 0;
      if (byType[r.serviceType]) {
        byType[r.serviceType][r.status] = n;
        totals[r.serviceType] += n;
      }
      if (
        r.status === ServiceRequestStatus.NEW ||
        r.status === ServiceRequestStatus.CONTACTED ||
        r.status === ServiceRequestStatus.SCHEDULED
      ) {
        openTotal += n;
      }
    }

    return { byType, totals, openTotal };
  }

  async ensureOwner(id: number, userId: number): Promise<void> {
    const row = await this.repo.findOneBy({ id });
    if (!row) {
      throw new NotFoundException(`Service request ${id} not found`);
    }
    if (row.userId !== userId) {
      throw new ForbiddenException('Not your service request');
    }
  }

  private emptyStatusMap(): Record<ServiceRequestStatus, number> {
    return {
      [ServiceRequestStatus.NEW]: 0,
      [ServiceRequestStatus.CONTACTED]: 0,
      [ServiceRequestStatus.SCHEDULED]: 0,
      [ServiceRequestStatus.COMPLETED]: 0,
      [ServiceRequestStatus.CANCELLED]: 0,
    };
  }

  private map(r: ServiceRequest): ServiceRequestResponse {
    return {
      id: r.id,
      serviceType: r.serviceType,
      status: r.status,
      userId: r.userId,
      name: r.name,
      phone: r.phone,
      email: r.email,
      city: r.city,
      addressLine: r.addressLine,
      pincode: r.pincode,
      preferredDate: r.preferredDate,
      preferredSlot: r.preferredSlot,
      details: r.details,
      internalNotes: r.internalNotes,
      assignedAdminId: r.assignedAdminId,
      assignedVendorUserId: r.assignedVendorUserId,
      customerRating: r.customerRating,
      customerFeedback: r.customerFeedback,
      customerReviewedAt: r.customerReviewedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
