import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { ListEmailLogsQueryDto } from './dto/list-email-logs.query.dto';
import { EmailLog } from './entities/email-log.entity';
import { EmailLogResponse, MailService } from './mail.service';

export interface PagedEmailLogs {
  items: EmailLogResponse[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class EmailLogsService {
  constructor(
    @InjectRepository(EmailLog)
    private readonly repo: Repository<EmailLog>,
    private readonly mailService: MailService,
  ) {}

  async adminList(query: ListEmailLogsQueryDto): Promise<PagedEmailLogs> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
    const qb = this.repo.createQueryBuilder('e').orderBy('e.createdAt', 'DESC');

    if (query.feature?.trim()) {
      qb.andWhere('e.feature = :feature', { feature: query.feature.trim() });
    }
    if (query.status) {
      qb.andWhere('e.status = :status', { status: query.status });
    }

    const search = query.q?.trim();
    if (search) {
      qb.andWhere(
        new Brackets((b) => {
          b.where('e.recipientEmail LIKE :q', { q: `%${search}%` })
            .orWhere('e.subject LIKE :q', { q: `%${search}%` })
            .orWhere('e.templateKey LIKE :q', { q: `%${search}%` });
        }),
      );
    }

    qb.skip((page - 1) * limit).take(limit);
    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((row) => this.mailService.map(row)),
      total,
      page,
      limit,
    };
  }

  async adminFindOne(id: number): Promise<EmailLogResponse> {
    const row = await this.repo.findOneBy({ id });
    if (!row) {
      throw new NotFoundException(`Email log ${id} not found`);
    }
    return this.mailService.map(row);
  }

  async adminResend(
    id: number,
    triggeredByUserId?: number,
  ): Promise<EmailLogResponse> {
    const row = await this.repo.findOneBy({ id });
    if (!row) {
      throw new NotFoundException(`Email log ${id} not found`);
    }
    return this.mailService.resend(id, triggeredByUserId);
  }
}