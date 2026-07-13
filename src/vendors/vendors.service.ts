import {
  BadRequestException,
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
import { Category } from '../categories/entities/category.entity';
import { CategoryServiceMapping } from '../categories/entities/category-service-mapping.entity';
import { ServiceRequest, ServiceRequestStatus, ServiceType } from '../service-requests/entities/service-request.entity';
import { UpdateVendorMeDto } from './dto/update-vendor-me.dto';
import { AdminUpdateVendorDto } from './dto/admin-update-vendor.dto';
import { ListVendorsQueryDto } from './dto/list-vendors.query.dto';
import { User, UserRole } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { VendorLead, VendorLeadStatus } from '../vendor-leads/entities/vendor-lead.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { VendorsNotifier } from './vendors.notifier';

export interface PublicVendorProfileResponse {
  userId: number;
  vendorName: string | null;
  overallRating: number | null;
  reviewCount: number;
  businessName: string | null;
  categories: Array<{ id: number; name: string }>;
  about: string | null;
  experience: string | null;
  serviceLocations: string[] | null;
  workingHours: string | null;
  publicPhotoUrls: string[] | null;
  certificateUrls: string[] | null;
  completedJobsCount: number;
  slug: string | null;
}

export interface PublicVendorOptionResponse {
  userId: number;
  businessName: string | null;
  vendorName: string | null;
  slug: string | null;
  categories: Array<{ id: number; name: string }>;
  serviceLocations: string[] | null;
  workingHours: string | null;
  overallRating: number | null;
  reviewCount: number;
  completedJobsCount: number;
  photoUrl: string | null;
}

export interface VendorProfileResponse {
  id: number;
  userId: number;
  businessName: string | null;
  categories: Array<{ id: number; name: string }>;
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
    @InjectRepository(CategoryServiceMapping)
    private readonly mappingRepo: Repository<CategoryServiceMapping>,
    @InjectRepository(ServiceRequest)
    private readonly serviceRequestRepo: Repository<ServiceRequest>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    private readonly usersService: UsersService,
    private readonly notifications: NotificationsService,
    private readonly vendorsNotifier: VendorsNotifier,
  ) {}

  async ensureProfileForUser(userId: number): Promise<VendorProfile> {
    let profile = await this.profileRepo.findOneBy({ userId });
    if (!profile) {
      profile = this.profileRepo.create({
        userId,
        verificationStatus: VendorVerificationStatus.PENDING,
        categoryIds: [],
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
    return await this.mapProfile(profile, user);
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
    const prevStatus = profile.verificationStatus;
    const prevHadKyc = this.hasKycPayload(profile);
    if (dto.businessName !== undefined) profile.businessName = dto.businessName;
    if (dto.categoryIds !== undefined) profile.categoryIds = dto.categoryIds;
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
    if (
      user.isActive !== false &&
      profile.verificationStatus === VendorVerificationStatus.REJECTED
    ) {
      profile.verificationStatus = VendorVerificationStatus.PENDING;
      profile.rejectionReason = null;
    }
    const saved = await this.profileRepo.save(profile);
    const nowHasKyc = this.hasKycPayload(saved);
    if (
      saved.verificationStatus === VendorVerificationStatus.PENDING &&
      (prevStatus === VendorVerificationStatus.REJECTED ||
        (!prevHadKyc && nowHasKyc))
    ) {
      this.vendorsNotifier.notifyAdminsOfKycPending(saved, user);
    }
    return await this.mapProfile(saved, user);
  }

  private hasKycPayload(profile: VendorProfile): boolean {
    return (
      Boolean(profile.businessName?.trim()) &&
      (profile.categoryIds?.length ?? 0) > 0
    );
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
    const categories = await this.populateCategories(profile);
    const completedJobsCount = await this.leadRepo.count({
      where: {
        vendorUserId: profile.userId,
        status: VendorLeadStatus.COMPLETED,
      },
    });
    const rating = await this.getRatingSummary([profile.userId]);
    const ratingSummary = rating.get(profile.userId);
    return {
      userId: profile.userId,
      vendorName: user.name,
      overallRating: ratingSummary?.overallRating ?? null,
      reviewCount: ratingSummary?.reviewCount ?? 0,
      businessName: profile.businessName,
      categories,
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

  async listPublicVendorOptions(
    categoryId?: string,
  ): Promise<PublicVendorOptionResponse[]> {

    if(!Number(categoryId) && Number(categoryId) !== 0) {
      return [];
    }

    const profiles = await this.profileRepo
  .createQueryBuilder('profile')
  .where('profile.verificationStatus = :status', {
    status: VendorVerificationStatus.VERIFIED,
  })
  .andWhere('JSON_CONTAINS(profile.categoryIds, :categoryId)', {
    categoryId: String(Number(categoryId)),
  })
  .orderBy('profile.businessName', 'ASC')
  .getMany();

    console.log('listPublicVendorOptions', { categoryId, profiles });
    
    if (profiles.length === 0) return [];

    const userIds = profiles.map((p) => p.userId);
    const users = await this.userRepo.findBy({ id: In(userIds) });
    const userMap = new Map(users.map((u) => [u.id, u]));
    const activeProfiles = profiles.filter((profile) => {
      const user = userMap.get(profile.userId);
      return user?.isActive !== false && user?.role === UserRole.VENDOR;
    });
    if (activeProfiles.length === 0) return [];

    const activeUserIds = activeProfiles.map((p) => p.userId);
    const ratingMap = await this.getRatingSummary(activeUserIds);
    const completedMap = await this.getCompletedJobsSummary(activeUserIds);

    const rows = await Promise.all(
      activeProfiles.map(async (profile) => {
        const user = userMap.get(profile.userId) ?? null;
        const rating = ratingMap.get(profile.userId);
        const completedJobsCount = completedMap.get(profile.userId) ?? 0;
        const categories = await this.populateCategories(profile);
        return {
          sortName: (profile.businessName || user?.name || '').toLowerCase(),
          option: {
            userId: profile.userId,
            businessName: profile.businessName,
            vendorName: user?.name ?? null,
            slug: profile.slug,
            categories,
            serviceLocations: profile.serviceLocations,
            workingHours: profile.workingHours,
            overallRating: rating?.overallRating ?? null,
            reviewCount: rating?.reviewCount ?? 0,
            completedJobsCount,
            photoUrl: profile.publicPhotoUrls?.[0] ?? user?.avatarUrl ?? null,
          } satisfies PublicVendorOptionResponse,
        };
      }),
    );

    return rows
      .sort((a, b) => {
        const ar = a.option.overallRating ?? 0;
        const br = b.option.overallRating ?? 0;
        if (br !== ar) return br - ar;
        if (b.option.reviewCount !== a.option.reviewCount) {
          return b.option.reviewCount - a.option.reviewCount;
        }
        if (b.option.completedJobsCount !== a.option.completedJobsCount) {
          return b.option.completedJobsCount - a.option.completedJobsCount;
        }
        return a.sortName.localeCompare(b.sortName);
      })
      .map((row) => row.option);
  }

  async resolveSelectableVendorUserId(
    vendorUserId: number | null | undefined,
    serviceType: ServiceType,
  ): Promise<number | null> {
    if (vendorUserId == null) return null;
    this.assertKnownServiceType(serviceType);

    const profile = await this.profileRepo.findOneBy({ userId: vendorUserId });
    if (!profile || profile.verificationStatus !== VendorVerificationStatus.VERIFIED) {
      throw new BadRequestException('Selected vendor is not available for this service.');
    }
    const user = await this.usersService.findOne(vendorUserId);
    if (user.role !== UserRole.VENDOR || user.isActive === false) {
      throw new BadRequestException('Selected vendor is not available for this service.');
    }
    const categoryIds = await this.findCategoryIdsForService(serviceType);
    const hasServiceCategory = profile.categoryIds?.some((id) => categoryIds.has(id));
    if (!hasServiceCategory) {
      throw new BadRequestException('Selected vendor does not provide this service.');
    }
    return vendorUserId;
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
      items: await Promise.all(
        profiles.map((p) =>
          this.mapProfile(p, userMap.get(p.userId) ?? null),
        ),
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
    return await this.mapProfile(saved, updatedUser);
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

  private assertKnownServiceType(serviceType: ServiceType): void {
    if (!Object.values(ServiceType).includes(serviceType)) {
      throw new BadRequestException('Invalid service type.');
    }
  }

  private async findCategoryIdsForService(serviceType: ServiceType): Promise<Set<number>> {
    const mappings = await this.mappingRepo.find({
      where: { service: serviceType, isActive: true },
      select: ['categoryId'],
    });
    return new Set(mappings.map((mapping) => mapping.categoryId));
  }

  private async getRatingSummary(
    vendorUserIds: number[],
  ): Promise<Map<number, { overallRating: number; reviewCount: number }>> {
    if (vendorUserIds.length === 0) return new Map();
    const rows = await this.serviceRequestRepo
      .createQueryBuilder('sr')
      .select('sr.assignedVendorUserId', 'vendorUserId')
      .addSelect('AVG(sr.customerRating)', 'overallRating')
      .addSelect('COUNT(sr.customerRating)', 'reviewCount')
      .where('sr.assignedVendorUserId IN (:...vendorUserIds)', { vendorUserIds })
      .andWhere('sr.customerRating IS NOT NULL')
      .andWhere('sr.status = :status', { status: ServiceRequestStatus.COMPLETED })
      .groupBy('sr.assignedVendorUserId')
      .getRawMany<{ vendorUserId: number | string; overallRating: string; reviewCount: string }>();

    return new Map(
      rows.map((row) => [
        Number(row.vendorUserId),
        {
          overallRating: Math.round((Number(row.overallRating) || 0) * 10) / 10,
          reviewCount: Number(row.reviewCount) || 0,
        },
      ]),
    );
  }

  private async getCompletedJobsSummary(vendorUserIds: number[]): Promise<Map<number, number>> {
    if (vendorUserIds.length === 0) return new Map();
    const rows = await this.leadRepo
      .createQueryBuilder('lead')
      .select('lead.vendorUserId', 'vendorUserId')
      .addSelect('COUNT(*)', 'completedJobsCount')
      .where('lead.vendorUserId IN (:...vendorUserIds)', { vendorUserIds })
      .andWhere('lead.status = :status', { status: VendorLeadStatus.COMPLETED })
      .groupBy('lead.vendorUserId')
      .getRawMany<{ vendorUserId: number | string; completedJobsCount: string }>();

    return new Map(
      rows.map((row) => [Number(row.vendorUserId), Number(row.completedJobsCount) || 0]),
    );
  }

  private getLocationRank(serviceLocations: string[] | null, query?: string): number {
    const normalizedQuery = this.normalizeLocation(query);
    if (!normalizedQuery || !serviceLocations?.length) return 0;
    const queryTerms = normalizedQuery.split(' ').filter(Boolean);
    let best = 0;
    for (const location of serviceLocations) {
      const normalizedLocation = this.normalizeLocation(location);
      if (!normalizedLocation) continue;
      if (normalizedLocation === normalizedQuery) best = Math.max(best, 3);
      if (
        normalizedLocation.includes(normalizedQuery) ||
        normalizedQuery.includes(normalizedLocation)
      ) {
        best = Math.max(best, 2);
      }
      if (queryTerms.some((term) => term.length >= 3 && normalizedLocation.includes(term))) {
        best = Math.max(best, 1);
      }
    }
    return best;
  }

  private normalizeLocation(value?: string | null): string {
    return (value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private async mapProfile(
    profile: VendorProfile,
    user: User | null,
  ): Promise<VendorProfileResponse> {
    const categories = await this.populateCategories(profile);
    return {
      id: profile.id,
      userId: profile.userId,
      businessName: profile.businessName,
      categories,
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

  private async populateCategories(
    profile: VendorProfile,
  ): Promise<Array<{ id: number; name: string }>> {
    if (!profile.categoryIds || profile.categoryIds.length === 0) {
      return [];
    }
    const cats = await this.categoryRepo.findBy({ id: In(profile.categoryIds) });
    return cats.map((c) => ({ id: c.id, name: c.name }));
  }

  private async findCategoryByString(
    categoryQuery: string,
    serviceType: ServiceType,
  ): Promise<Category | null> {
    const q = categoryQuery.trim().toLowerCase();

    // 1. Fetch all active categories mapped to this service
    const categoryIds = await this.findCategoryIdsForService(serviceType);
    if (categoryIds.size === 0) return null;

    const categories = await this.categoryRepo.findBy({
      id: In(Array.from(categoryIds)),
      isActive: true,
    });

    // 2. Try exact match on slug or name
    let matched = categories.find(
      (c) => c.slug.toLowerCase() === q || c.name.toLowerCase() === q,
    );
    if (matched) return matched;

    // 3. Try matching after converting underscores to hyphens or vice versa
    const normalizedQ = q.replace(/_/g, '-');
    matched = categories.find(
      (c) => c.slug.toLowerCase() === normalizedQ || c.name.toLowerCase() === normalizedQ,
    );
    if (matched) return matched;

    // 4. Try matching partial words if they are close
    const queryWords = q.split(/[^a-z0-9]+/).filter(Boolean);
    if (queryWords.length > 0) {
      matched = categories.find((c) => {
        const nameLower = c.name.toLowerCase();
        const slugLower = c.slug.toLowerCase();
        return queryWords.every((word) => nameLower.includes(word) || slugLower.includes(word));
      });
      if (matched) return matched;
    }

    return null;
  }
}
