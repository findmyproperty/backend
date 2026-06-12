import {
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
import { CreateEventManagementDto } from './dto/create-event-management.dto';
import { UpdateServiceRequestDto } from './dto/update-service-request.dto';
import { ListServiceRequestsQueryDto } from './dto/list-service-requests.query.dto';
import { ServiceRequestsNotifier } from './service-requests.notifier';
import { DistanceService } from './distance.service';
import { VendorLeadsService } from '../vendor-leads/vendor-leads.service';

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
  ) {}

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
    const entity = this.repo.create({
      serviceType,
      status: ServiceRequestStatus.NEW,
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
    });
    const saved = await this.repo.save(entity);
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
    if (dto.status !== undefined && previousStatus !== saved.status) {
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
      [ServiceType.EVENT_MANAGEMENT]: this.emptyStatusMap(),
    } as Record<ServiceType, Record<ServiceRequestStatus, number>>;

    const totals: Record<ServiceType, number> = {
      [ServiceType.PACKERS_MOVERS]: 0,
      [ServiceType.PAINTING_CLEANING]: 0,
      [ServiceType.EVENT_MANAGEMENT]: 0,
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
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
