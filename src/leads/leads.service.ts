import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { LeadStatus, PropertyLead } from './entities/property-lead.entity';
import { PropertiesService } from '../properties/properties.service';
import { User } from '../users/entities/user.entity';
import { Property } from '../properties/entities/property.entity';
import { LeadsNotifier } from './leads.notifier';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

export interface LeadResponse {
  id: number;
  propertyId: number;
  propertyTitle: string;
  tenantId: number;
  tenantName: string | null;
  tenantEmail: string | null;
  tenantPhone: string | null;
  message: string | null;
  status: LeadStatus;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class LeadsService {
  constructor(
    @InjectRepository(PropertyLead)
    private readonly leadRepository: Repository<PropertyLead>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    private readonly propertiesService: PropertiesService,
    private readonly notifier: LeadsNotifier,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    tenantUserId: number,
    dto: CreateLeadDto,
  ): Promise<LeadResponse> {
    const property = await this.propertiesService.findOne(dto.propertyId);
    const agentUserId = this.propertiesService.getListingAgentUserId(property);
    if (agentUserId == null) {
      throw new BadRequestException(
        'This property has no listing agent assigned; enquiries cannot be submitted.',
      );
    }

    const listingAgent = await this.userRepository.findOneBy({
      id: agentUserId,
    });
    if (!listingAgent || listingAgent.role !== 'agent') {
      throw new BadRequestException(
        'This property does not have an agent assigned for enquiries.',
      );
    }

    const existingOpen = await this.leadRepository.findOne({
      where: [
        {
          tenantUserId,
          propertyId: dto.propertyId,
          status: LeadStatus.NEW,
        },
        {
          tenantUserId,
          propertyId: dto.propertyId,
          status: LeadStatus.CONTACTED,
        },
      ],
    });
    if (existingOpen) {
      throw new ConflictException(
        'You already have an open enquiry for this property.',
      );
    }

    const lead = this.leadRepository.create({
      propertyId: dto.propertyId,
      tenantUserId,
      agentUserId,
      message: dto.message?.trim() || null,
      status: LeadStatus.NEW,
    });
    const saved = await this.leadRepository.save(lead);
    const tenant = await this.userRepository.findOneBy({ id: tenantUserId });
    if (!tenant) {
      throw new NotFoundException('Tenant user not found');
    }
    this.notifier.notifyAgentNewLead(saved, property, tenant, listingAgent);
    await this.notifications.create({
      userId: listingAgent.id,
      type: NotificationType.PROPERTY_LEAD_NEW,
      title: `New enquiry — ${property.title}`,
      body: `${tenant.name ?? 'A tenant'} sent an enquiry for ${property.title}.`,
      metadata: { leadId: saved.id, propertyId: property.id },
    });
    return this.mapLead(saved, property, tenant);
  }

  async findAllForAgent(agentUserId: number): Promise<LeadResponse[]> {
    const leads = await this.leadRepository.find({
      where: { agentUserId },
      order: { createdAt: 'DESC' },
    });
    if (leads.length === 0) {
      return [];
    }
    const propertyIds = [...new Set(leads.map((l) => l.propertyId))];
    const tenantIds = [...new Set(leads.map((l) => l.tenantUserId))];
    const [properties, tenants] = await Promise.all([
      this.propertyRepository.findBy({ id: In(propertyIds) }),
      this.userRepository.findBy({ id: In(tenantIds) }),
    ]);
    const propMap = new Map(properties.map((p) => [p.id, p]));
    const tenantMap = new Map(tenants.map((t) => [t.id, t]));
    return leads.map((lead) => {
      const prop = propMap.get(lead.propertyId);
      const tenant = tenantMap.get(lead.tenantUserId);
      if (!prop || !tenant) {
        throw new NotFoundException('Related property or tenant missing');
      }
      return this.mapLead(lead, prop, tenant);
    });
  }

  async updateStatus(
    leadId: number,
    agentUserId: number,
    dto: UpdateLeadStatusDto,
  ): Promise<LeadResponse> {
    const lead = await this.leadRepository.findOneBy({ id: leadId });
    if (!lead) {
      throw new NotFoundException(`Lead with ID ${leadId} not found`);
    }
    if (lead.agentUserId !== agentUserId) {
      throw new ForbiddenException('You can only update your own leads');
    }
    const previousStatus = lead.status;
    lead.status = dto.status;
    const saved = await this.leadRepository.save(lead);
    const property = await this.propertiesService.findOne(lead.propertyId);
    const tenant = await this.userRepository.findOneBy({
      id: lead.tenantUserId,
    });
    if (!tenant) {
      throw new NotFoundException('Tenant user not found');
    }
    this.notifier.notifyTenantStatusChange(
      saved,
      property,
      tenant,
      previousStatus,
    );
    return this.mapLead(saved, property, tenant);
  }

  private mapLead(
    lead: PropertyLead,
    property: Property,
    tenant: User,
  ): LeadResponse {
    return {
      id: lead.id,
      propertyId: lead.propertyId,
      propertyTitle: property.title,
      tenantId: lead.tenantUserId,
      tenantName: tenant.name,
      tenantEmail: tenant.email,
      tenantPhone: tenant.phone,
      message: lead.message,
      status: lead.status,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    };
  }
}
