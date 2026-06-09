import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  VendorProfile,
  VendorVerificationStatus,
} from './entities/vendor-profile.entity';
import { UpdateVendorMeDto } from './dto/update-vendor-me.dto';
import { AdminUpdateVendorDto } from './dto/admin-update-vendor.dto';
import { ListVendorsQueryDto } from './dto/list-vendors.query.dto';
import { User, UserRole } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { VendorLead, VendorLeadStatus } from '../vendor-leads/entities/vendor-lead.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

export interface PublicVendorProfileResponse {
  userId: number;
  businessName: string | null;
  category: string;
  about: string | null;
  experience: string | null;
  serviceLocations: string[] | null;
  workingHours: string | null;
  publicPhotoUrls: string[] | null;
  certificateUrls: string[] | null;
  completedJobsCount: number;
  slug: string | null;
}

export interface VendorProfileResponse {
  id: number;
  userId: number;
  businessName: string | null;
  category: string;
  verificationStatus: string;
  rejectionReason: string | null;
  documents: VendorProfile['documents'];
  experience: string | null;
  serviceLocations: string[] | null;
  about: string | null;
  workingHours: string | null;
  publicPhotoUrls: string[] | null;
  certificateUrls: string[] | null;
  slug: string | null;
  createdAt: Date;
  updatedAt: Date;
  user?: {
    id: number;
    name: string | null;
    email: string | null;
    phone: string | null;
    isActive: boolean;
  };
}

@Injectable()
export class VendorsService {
  constructor(
    @InjectRepository(VendorProfile)
    private readonly profileRepo: Repository<VendorProfile>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(VendorLead)
    private readonly leadRepo: Repository<VendorLead>,
    private readonly usersService: UsersService,
    private readonly notifications: NotificationsService,
  ) {}

  async ensureProfileForUser(userId: number): Promise<VendorProfile> {
    let profile = await this.profileRepo.findOneBy({ userId });
    if (!profile) {
      profile = this.profileRepo.create({
        userId,
        verificationStatus: VendorVerificationStatus.PENDING,
      });
      profile = await this.profileRepo.save(profile);
    }
    return profile;
  }

  async getMe(userId: number): Promise<VendorProfileResponse> {
    const user = await this.usersService.findOne(userId);
    if (user.role !== UserRole.VENDOR) {
      throw new ForbiddenException('Not a vendor account');
    }
    const profile = await this.ensureProfileForUser(userId);
    return this.mapProfile(profile, user);
  }

  async updateMe(
    userId: number,
    dto: UpdateVendorMeDto,
  ): Promise<VendorProfileResponse> {
    const user = await this.usersService.findOne(userId);
    if (user.role !== UserRole.VENDOR) {
      throw new ForbiddenException('Not a vendor account');
    }
    const profile = await this.ensureProfileForUser(userId);
    if (dto.businessName !== undefined) profile.businessName = dto.businessName;
    if (dto.category !== undefined) profile.category = dto.category;
    if (dto.documents !== undefined) profile.documents = dto.documents;
    if (dto.experience !== undefined) profile.experience = dto.experience;
    if (dto.serviceLocations !== undefined) {
      profile.serviceLocations = dto.serviceLocations;
    }
    if (dto.about !== undefined) profile.about = dto.about;
    if (dto.workingHours !== undefined) profile.workingHours = dto.workingHours;
    if (dto.publicPhotoUrls !== undefined) {
      profile.publicPhotoUrls = dto.publicPhotoUrls;
    }
    if (dto.certificateUrls !== undefined) {
      profile.certificateUrls = dto.certificateUrls;
    }
    if (dto.slug !== undefined) profile.slug = dto.slug;
    const saved = await this.profileRepo.save(profile);
    return this.mapProfile(saved, user);
  }

  async getPublicProfile(idOrSlug: string): Promise<PublicVendorProfileResponse> {
    const numericId = Number(idOrSlug);
    let profile: VendorProfile | null = null;
    if (Number.isFinite(numericId) && numericId > 0) {
      profile = await this.profileRepo.findOneBy({ userId: numericId });
    }
    if (!profile) {
      profile = await this.profileRepo.findOneBy({ slug: idOrSlug });
    }
    if (!profile || profile.verificationStatus !== VendorVerificationStatus.VERIFIED) {
      throw new NotFoundException('Vendor not found');
    }
    const user = await this.usersService.findOne(profile.userId);
    if (user.isActive === false) {
      throw new NotFoundException('Vendor not found');
    }
    const completedJobsCount = await this.leadRepo.count({
      where: {
        vendorUserId: profile.userId,
        status: VendorLeadStatus.COMPLETED,
      },
    });
    return {
      userId: profile.userId,
      businessName: profile.businessName,
      category: profile.category,
      about: profile.about,
      experience: profile.experience,
      serviceLocations: profile.serviceLocations,
      workingHours: profile.workingHours,
      publicPhotoUrls: profile.publicPhotoUrls,
      certificateUrls: profile.certificateUrls,
      completedJobsCount,
      slug: profile.slug,
    };
  }

  async adminList(query: ListVendorsQueryDto): Promise<{
    items: VendorProfileResponse[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.profileRepo
      .createQueryBuilder('vp')
      .orderBy('vp.updatedAt', 'DESC');
    if (query.verificationStatus) {
      qb.andWhere('vp.verificationStatus = :vs', {
        vs: query.verificationStatus,
      });
    }
    qb.skip((page - 1) * limit).take(limit);
    const [profiles, total] = await qb.getManyAndCount();
    const userIds = profiles.map((p) => p.userId);
    const users =
      userIds.length > 0
        ? await this.userRepo.findBy({ id: In(userIds) })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u]));
    return {
      items: profiles.map((p) =>
        this.mapProfile(p, userMap.get(p.userId) ?? null),
      ),
      total,
      page,
      limit,
    };
  }

  async adminUpdate(
    userId: number,
    dto: AdminUpdateVendorDto,
  ): Promise<VendorProfileResponse> {
    const user = await this.usersService.findOne(userId);
    if (user.role !== UserRole.VENDOR) {
      throw new NotFoundException('Vendor user not found');
    }
    const profile = await this.ensureProfileForUser(userId);
    const prevStatus = profile.verificationStatus;
    if (dto.verificationStatus !== undefined) {
      profile.verificationStatus = dto.verificationStatus;
    }
    if (dto.rejectionReason !== undefined) {
      profile.rejectionReason = dto.rejectionReason;
    }
    if (dto.isActive !== undefined) {
      await this.usersService.update(userId, { isActive: dto.isActive });
    }
    const saved = await this.profileRepo.save(profile);
    const updatedUser = await this.usersService.findOne(userId);
    if (
      dto.verificationStatus === VendorVerificationStatus.VERIFIED &&
      prevStatus !== VendorVerificationStatus.VERIFIED
    ) {
      await this.notifications.create({
        userId,
        type: NotificationType.VENDOR_VERIFIED,
        title: 'Partner profile verified',
        body: 'You can now accept leads assigned by FMP.',
      });
    }
    if (dto.verificationStatus === VendorVerificationStatus.REJECTED) {
      await this.notifications.create({
        userId,
        type: NotificationType.VENDOR_REJECTED,
        title: 'Partner application rejected',
        body: dto.rejectionReason || profile.rejectionReason || 'Contact support for details.',
      });
    }
    return this.mapProfile(saved, updatedUser);
  }

  async findVerifiedVendorIds(): Promise<number[]> {
    const rows = await this.profileRepo.find({
      where: { verificationStatus: VendorVerificationStatus.VERIFIED },
      select: ['userId'],
    });
    return rows.map((r) => r.userId);
  }

  async listVerifiedVendorsForSelect(): Promise<
    Array<{ userId: number; label: string }>
  > {
    const profiles = await this.profileRepo.find({
      where: { verificationStatus: VendorVerificationStatus.VERIFIED },
      order: { businessName: 'ASC' },
    });
    if (profiles.length === 0) return [];
    const ids = profiles.map((p) => p.userId);
    const users = ids.length > 0 ? await this.userRepo.findBy({ id: In(ids) }) : [];
    const userMap = new Map(users.map((u) => [u.id, u]));
    return profiles
      .filter((p) => userMap.get(p.userId)?.isActive !== false)
      .map((p) => {
        const u = userMap.get(p.userId);
        const label =
          p.businessName?.trim() ||
          u?.name?.trim() ||
          `Vendor #${p.userId}`;
        return { userId: p.userId, label };
      });
  }

  assertVendorCanOperate(profile: VendorProfile, user: User): void {
    if (user.isActive === false) {
      throw new ForbiddenException('Vendor account is blocked');
    }
    if (profile.verificationStatus !== VendorVerificationStatus.VERIFIED) {
      throw new ForbiddenException(
        'Vendor profile must be verified before accepting leads',
      );
    }
  }

  private mapProfile(
    profile: VendorProfile,
    user: User | null,
  ): VendorProfileResponse {
    return {
      id: profile.id,
      userId: profile.userId,
      businessName: profile.businessName,
      category: profile.category,
      verificationStatus: profile.verificationStatus,
      rejectionReason: profile.rejectionReason,
      documents: profile.documents,
      experience: profile.experience,
      serviceLocations: profile.serviceLocations,
      about: profile.about,
      workingHours: profile.workingHours,
      publicPhotoUrls: profile.publicPhotoUrls,
      certificateUrls: profile.certificateUrls,
      slug: profile.slug,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      user: user
        ? {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            isActive: user.isActive,
          }
        : undefined,
    };
  }
}
