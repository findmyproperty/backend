import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { CreateJobConsultancyRequestDto } from './dto/create-job-consultancy-request.dto';
import { ListJobConsultancyRequestsQueryDto } from './dto/list-job-consultancy-requests.query.dto';
import { UpdateJobConsultancyRequestDto } from './dto/update-job-consultancy-request.dto';
import {
  JobConsultancyRequest,
  JobConsultancyStatus,
  JobConsultancyType,
} from './entities/job-consultancy-request.entity';
import { JobConsultancyNotifier } from './job-consultancy.notifier';

export interface JobConsultancyRequestResponse {
  id: number;
  consultancyType: JobConsultancyType;
  status: JobConsultancyStatus;
  userId: number | null;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  details: JobConsultancyRequest['details'];
  internalNotes: string | null;
  assignedAdminId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PagedJobConsultancyRequests {
  items: JobConsultancyRequestResponse[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class JobConsultancyService {
  constructor(
    @InjectRepository(JobConsultancyRequest)
    private readonly repo: Repository<JobConsultancyRequest>,
    private readonly notifier: JobConsultancyNotifier,
  ) {}

  async create(
    dto: CreateJobConsultancyRequestDto,
    userId: number | null,
  ): Promise<JobConsultancyRequestResponse> {
    const entity = this.repo.create({
      consultancyType: dto.consultancyType,
      status: JobConsultancyStatus.NEW,
      userId: userId ?? null,
      name: dto.name.trim(),
      phone: dto.phone.trim(),
      email: dto.email?.trim() || null,
      city: dto.city?.trim() || null,
      details: {
        notes: dto.details?.notes?.trim() || null,
      },
      internalNotes: null,
      assignedAdminId: null,
    });
    const saved = await this.repo.save(entity);
    this.notifier.notifyAdminsOfNewRequest(saved);
    return this.map(saved);
  }

  async findMine(userId: number): Promise<JobConsultancyRequestResponse[]> {
    const rows = await this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => this.map(r));
  }

  async adminList(
    query: ListJobConsultancyRequestsQueryDto,
  ): Promise<PagedJobConsultancyRequests> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const qb = this.repo
      .createQueryBuilder('jc')
      .orderBy('jc.createdAt', 'DESC');
    if (query.consultancyType) {
      qb.andWhere('jc.consultancyType = :t', { t: query.consultancyType });
    }
    if (query.status) {
      qb.andWhere('jc.status = :s', { s: query.status });
    }
    const search = query.q?.trim();
    if (search) {
      qb.andWhere(
        new Brackets((b) => {
          b.where('jc.name LIKE :q', { q: `%${search}%` }).orWhere(
            'jc.phone LIKE :q',
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

  async adminFindOne(id: number): Promise<JobConsultancyRequestResponse> {
    const row = await this.repo.findOneBy({ id });
    if (!row) {
      throw new NotFoundException(`Job consultancy request ${id} not found`);
    }
    return this.map(row);
  }

  async adminUpdate(
    id: number,
    dto: UpdateJobConsultancyRequestDto,
  ): Promise<JobConsultancyRequestResponse> {
    const row = await this.repo.findOneBy({ id });
    if (!row) {
      throw new NotFoundException(`Job consultancy request ${id} not found`);
    }
    const previousStatus = row.status;
    if (dto.status !== undefined) row.status = dto.status;
    if (dto.internalNotes !== undefined) row.internalNotes = dto.internalNotes;
    if (dto.assignedAdminId !== undefined) {
      row.assignedAdminId = dto.assignedAdminId ?? null;
    }
    const saved = await this.repo.save(row);
    if (dto.status !== undefined && previousStatus !== saved.status) {
      this.notifier.notifyStatusChange(saved, previousStatus);
    }
    return this.map(saved);
  }

  async adminStats(): Promise<{
    byType: Record<JobConsultancyType, Record<JobConsultancyStatus, number>>;
    totals: Record<JobConsultancyType, number>;
    openTotal: number;
  }> {
    const rows = await this.repo
      .createQueryBuilder('jc')
      .select('jc.consultancyType', 'consultancyType')
      .addSelect('jc.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('jc.consultancyType')
      .addGroupBy('jc.status')
      .getRawMany<{
        consultancyType: JobConsultancyType;
        status: JobConsultancyStatus;
        count: string;
      }>();

    const byType = {
      [JobConsultancyType.IT]: this.emptyStatusMap(),
      [JobConsultancyType.NON_IT]: this.emptyStatusMap(),
      [JobConsultancyType.CUSTOMER_SUPPORT]: this.emptyStatusMap(),
    } as Record<JobConsultancyType, Record<JobConsultancyStatus, number>>;

    const totals: Record<JobConsultancyType, number> = {
      [JobConsultancyType.IT]: 0,
      [JobConsultancyType.NON_IT]: 0,
      [JobConsultancyType.CUSTOMER_SUPPORT]: 0,
    };
    let openTotal = 0;

    for (const r of rows) {
      const n = Number(r.count) || 0;
      if (byType[r.consultancyType]) {
        byType[r.consultancyType][r.status] = n;
        totals[r.consultancyType] += n;
      }
      if (
        r.status !== JobConsultancyStatus.PLACED &&
        r.status !== JobConsultancyStatus.REJECTED &&
        r.status !== JobConsultancyStatus.CANCELLED
      ) {
        openTotal += n;
      }
    }

    return { byType, totals, openTotal };
  }

  private emptyStatusMap(): Record<JobConsultancyStatus, number> {
    return {
      [JobConsultancyStatus.NEW]: 0,
      [JobConsultancyStatus.CONTACTED]: 0,
      [JobConsultancyStatus.SCREENING]: 0,
      [JobConsultancyStatus.INTERVIEW_SCHEDULED]: 0,
      [JobConsultancyStatus.PLACED]: 0,
      [JobConsultancyStatus.REJECTED]: 0,
      [JobConsultancyStatus.CANCELLED]: 0,
    };
  }

  private map(r: JobConsultancyRequest): JobConsultancyRequestResponse {
    return {
      id: r.id,
      consultancyType: r.consultancyType,
      status: r.status,
      userId: r.userId,
      name: r.name,
      phone: r.phone,
      email: r.email,
      city: r.city,
      details: r.details,
      internalNotes: r.internalNotes,
      assignedAdminId: r.assignedAdminId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}