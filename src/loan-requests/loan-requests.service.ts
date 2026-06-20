import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { CreateLoanRequestDto } from './dto/create-loan-request.dto';
import { ListLoanRequestsQueryDto } from './dto/list-loan-requests.query.dto';
import { UpdateLoanRequestDto } from './dto/update-loan-request.dto';
import {
  LoanRequest,
  LoanRequestStatus,
  LoanType,
} from './entities/loan-request.entity';
import { LoanRequestsNotifier } from './loan-requests.notifier';

export interface LoanRequestResponse {
  id: number;
  loanType: LoanType;
  status: LoanRequestStatus;
  userId: number | null;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  details: LoanRequest['details'];
  internalNotes: string | null;
  assignedAdminId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PagedLoanRequests {
  items: LoanRequestResponse[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class LoanRequestsService {
  constructor(
    @InjectRepository(LoanRequest)
    private readonly repo: Repository<LoanRequest>,
    private readonly notifier: LoanRequestsNotifier,
  ) {}

  async create(
    dto: CreateLoanRequestDto,
    userId: number | null,
  ): Promise<LoanRequestResponse> {
    const entity = this.repo.create({
      loanType: dto.loanType,
      status: LoanRequestStatus.NEW,
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

  async findMine(userId: number): Promise<LoanRequestResponse[]> {
    const rows = await this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => this.map(r));
  }

  async adminList(query: ListLoanRequestsQueryDto): Promise<PagedLoanRequests> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const qb = this.repo
      .createQueryBuilder('lr')
      .orderBy('lr.createdAt', 'DESC');
    if (query.loanType) {
      qb.andWhere('lr.loanType = :t', { t: query.loanType });
    }
    if (query.status) {
      qb.andWhere('lr.status = :s', { s: query.status });
    }
    const search = query.q?.trim();
    if (search) {
      qb.andWhere(
        new Brackets((b) => {
          b.where('lr.name LIKE :q', { q: `%${search}%` }).orWhere(
            'lr.phone LIKE :q',
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

  async adminFindOne(id: number): Promise<LoanRequestResponse> {
    const row = await this.repo.findOneBy({ id });
    if (!row) {
      throw new NotFoundException(`Loan request ${id} not found`);
    }
    return this.map(row);
  }

  async adminUpdate(
    id: number,
    dto: UpdateLoanRequestDto,
  ): Promise<LoanRequestResponse> {
    const row = await this.repo.findOneBy({ id });
    if (!row) {
      throw new NotFoundException(`Loan request ${id} not found`);
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
    byType: Record<LoanType, Record<LoanRequestStatus, number>>;
    totals: Record<LoanType, number>;
    openTotal: number;
  }> {
    const rows = await this.repo
      .createQueryBuilder('lr')
      .select('lr.loanType', 'loanType')
      .addSelect('lr.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('lr.loanType')
      .addGroupBy('lr.status')
      .getRawMany<{
        loanType: LoanType;
        status: LoanRequestStatus;
        count: string;
      }>();

    const byType = {
      [LoanType.HOME_LOAN]: this.emptyStatusMap(),
      [LoanType.PERSONAL_LOAN]: this.emptyStatusMap(),
      [LoanType.VEHICLE_LOAN]: this.emptyStatusMap(),
      [LoanType.MORTGAGE]: this.emptyStatusMap(),
    } as Record<LoanType, Record<LoanRequestStatus, number>>;

    const totals: Record<LoanType, number> = {
      [LoanType.HOME_LOAN]: 0,
      [LoanType.PERSONAL_LOAN]: 0,
      [LoanType.VEHICLE_LOAN]: 0,
      [LoanType.MORTGAGE]: 0,
    };
    let openTotal = 0;

    for (const r of rows) {
      const n = Number(r.count) || 0;
      if (byType[r.loanType]) {
        byType[r.loanType][r.status] = n;
        totals[r.loanType] += n;
      }
      if (
        r.status !== LoanRequestStatus.DISBURSED &&
        r.status !== LoanRequestStatus.REJECTED &&
        r.status !== LoanRequestStatus.CANCELLED
      ) {
        openTotal += n;
      }
    }

    return { byType, totals, openTotal };
  }

  private emptyStatusMap(): Record<LoanRequestStatus, number> {
    return {
      [LoanRequestStatus.NEW]: 0,
      [LoanRequestStatus.CONTACTED]: 0,
      [LoanRequestStatus.DOCUMENTS_PENDING]: 0,
      [LoanRequestStatus.UNDER_REVIEW]: 0,
      [LoanRequestStatus.APPROVED]: 0,
      [LoanRequestStatus.DISBURSED]: 0,
      [LoanRequestStatus.REJECTED]: 0,
      [LoanRequestStatus.CANCELLED]: 0,
    };
  }

  private map(r: LoanRequest): LoanRequestResponse {
    return {
      id: r.id,
      loanType: r.loanType,
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