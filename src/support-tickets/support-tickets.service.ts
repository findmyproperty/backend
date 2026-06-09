import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SupportTicket,
  SupportTicketStatus,
} from './entities/support-ticket.entity';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { AdminPatchSupportTicketDto } from './dto/admin-patch-support-ticket.dto';
import { ListSupportTicketsQueryDto } from './dto/list-support-tickets.query.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { UsersService } from '../users/users.service';
export interface SupportTicketResponse {
  id: number;
  userId: number;
  userRole: string;
  category: string;
  subject: string;
  body: string;
  status: string;
  adminNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  user?: { name: string | null; phone: string | null };
}

@Injectable()
export class SupportTicketsService {
  constructor(
    @InjectRepository(SupportTicket)
    private readonly repo: Repository<SupportTicket>,
    private readonly notifications: NotificationsService,
    private readonly usersService: UsersService,
  ) {}

  async create(
    userId: number,
    role: string,
    dto: CreateSupportTicketDto,
  ): Promise<SupportTicketResponse> {
    const row = this.repo.create({
      userId,
      userRole: role,
      category: dto.category,
      subject: dto.subject,
      body: dto.body,
      status: SupportTicketStatus.OPEN,
    });
    const saved = await this.repo.save(row);
    const admins = await this.usersService.findAllAdmins();
    for (const admin of admins) {
      await this.notifications.create({
        userId: admin.id,
        type: NotificationType.SUPPORT_REPLY,
        title: 'New support ticket',
        body: dto.subject,
        metadata: { ticketId: saved.id, fromUserId: userId },
      });
    }
    return this.map(saved);
  }

  async listMine(userId: number): Promise<SupportTicketResponse[]> {
    const rows = await this.repo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
    return rows.map((r) => this.map(r));
  }

  async adminList(query: ListSupportTicketsQueryDto): Promise<{
    items: SupportTicketResponse[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.repo.createQueryBuilder('t').orderBy('t.updatedAt', 'DESC');
    if (query.status) {
      qb.andWhere('t.status = :st', { st: query.status });
    }
    qb.skip((page - 1) * limit).take(limit);
    const [rows, total] = await qb.getManyAndCount();
    const items: SupportTicketResponse[] = [];
    for (const r of rows) {
      let user: { name: string | null; phone: string | null } | undefined;
      try {
        const u = await this.usersService.findOne(r.userId);
        user = { name: u.name, phone: u.phone };
      } catch {
        user = undefined;
      }
      items.push({ ...this.map(r), user });
    }
    return { items, total, page, limit };
  }

  async adminPatch(
    id: number,
    dto: AdminPatchSupportTicketDto,
  ): Promise<SupportTicketResponse> {
    const row = await this.repo.findOneBy({ id });
    if (!row) {
      throw new NotFoundException(`Ticket ${id} not found`);
    }
    if (dto.status !== undefined) row.status = dto.status;
    if (dto.adminNotes !== undefined) row.adminNotes = dto.adminNotes;
    const saved = await this.repo.save(row);

    if (dto.status === SupportTicketStatus.RESOLVED || dto.adminNotes) {
      await this.notifications.create({
        userId: row.userId,
        type: NotificationType.SUPPORT_REPLY,
        title: 'Support ticket updated',
        body: dto.adminNotes?.slice(0, 200) || `Status: ${saved.status}`,
        metadata: { ticketId: saved.id },
      });
    }

    return this.map(saved);
  }

  private map(t: SupportTicket): SupportTicketResponse {
    return {
      id: t.id,
      userId: t.userId,
      userRole: t.userRole,
      category: t.category,
      subject: t.subject,
      body: t.body,
      status: t.status,
      adminNotes: t.adminNotes,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }
}
