import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Property } from '../properties/entities/property.entity';
import { PropertyStatus } from '../properties/dto/create-property.dto';
import { User, UserRole } from '../users/entities/user.entity';

export interface DashboardStatCard {
  value: number;
  changePercent: number | null;
}

export interface AdminDashboardStats {
  totalProperties: DashboardStatCard;
  pendingApprovals: DashboardStatCard;
  activeAgents: DashboardStatCard;
  approvedThisWeek: DashboardStatCard;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  private percentChange(current: number, previous: number): number | null {
    if (previous === 0 && current === 0) {
      return 0;
    }
    if (previous === 0) {
      return current > 0 ? 100 : null;
    }
    return Math.round(((current - previous) / previous) * 100);
  }

  async getDashboardStats(): Promise<AdminDashboardStats> {
    const now = Date.now();
    const last7Start = new Date(now - 7 * MS_PER_DAY);
    const prev7Start = new Date(now - 14 * MS_PER_DAY);

    const totalProperties = await this.propertyRepository.count();

    const newListingsLast7 = await this.propertyRepository
      .createQueryBuilder('p')
      .where('p.createdAt >= :last7', { last7: last7Start })
      .getCount();

    const newListingsPrev7 = await this.propertyRepository
      .createQueryBuilder('p')
      .where('p.createdAt >= :prev7 AND p.createdAt < :last7', {
        prev7: prev7Start,
        last7: last7Start,
      })
      .getCount();

    const pendingApprovals = await this.propertyRepository.count({
      where: { status: PropertyStatus.PENDING },
    });

    const pendingSubmittedLast7 = await this.propertyRepository
      .createQueryBuilder('p')
      .where('p.status = :status', { status: PropertyStatus.PENDING })
      .andWhere('p.createdAt >= :last7', { last7: last7Start })
      .getCount();

    const pendingSubmittedPrev7 = await this.propertyRepository
      .createQueryBuilder('p')
      .where('p.status = :status', { status: PropertyStatus.PENDING })
      .andWhere('p.createdAt >= :prev7 AND p.createdAt < :last7', {
        prev7: prev7Start,
        last7: last7Start,
      })
      .getCount();

    const activeAgents = await this.userRepository.count({
      where: { role: UserRole.AGENT },
    });

    const newAgentsLast7 = await this.userRepository
      .createQueryBuilder('u')
      .where('u.role = :role', { role: UserRole.AGENT })
      .andWhere('u.createdAt >= :last7', { last7: last7Start })
      .getCount();

    const newAgentsPrev7 = await this.userRepository
      .createQueryBuilder('u')
      .where('u.role = :role', { role: UserRole.AGENT })
      .andWhere('u.createdAt >= :prev7 AND u.createdAt < :last7', {
        prev7: prev7Start,
        last7: last7Start,
      })
      .getCount();

    const approvedLast7 = await this.propertyRepository
      .createQueryBuilder('p')
      .where('p.status = :status', { status: PropertyStatus.APPROVED })
      .andWhere('p.approvedAt IS NOT NULL')
      .andWhere('p.approvedAt >= :last7', { last7: last7Start })
      .getCount();

    const approvedPrev7 = await this.propertyRepository
      .createQueryBuilder('p')
      .where('p.status = :status', { status: PropertyStatus.APPROVED })
      .andWhere('p.approvedAt IS NOT NULL')
      .andWhere('p.approvedAt >= :prev7 AND p.approvedAt < :last7', {
        prev7: prev7Start,
        last7: last7Start,
      })
      .getCount();

    return {
      totalProperties: {
        value: totalProperties,
        changePercent: this.percentChange(newListingsLast7, newListingsPrev7),
      },
      pendingApprovals: {
        value: pendingApprovals,
        changePercent: this.percentChange(
          pendingSubmittedLast7,
          pendingSubmittedPrev7,
        ),
      },
      activeAgents: {
        value: activeAgents,
        changePercent: this.percentChange(newAgentsLast7, newAgentsPrev7),
      },
      approvedThisWeek: {
        value: approvedLast7,
        changePercent: this.percentChange(approvedLast7, approvedPrev7),
      },
    };
  }
}
