import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { CreatePropertyDto, PropertyStatus } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { ApprovePropertyDto } from './dto/approve-property.dto';
import { RejectPropertyDto } from './dto/reject-property.dto';
import { Property } from './entities/property.entity';
import { UsersService } from '../users/users.service';
import { User, UserRole } from '../users/entities/user.entity';
import { buildPropertyPath } from '../helper/property-slug';
import { escapeHtmlForEmail } from '../helper/escape-html';

interface MailTransporter {
  sendMail(
    options: nodemailer.SendMailOptions,
  ): Promise<nodemailer.SentMessageInfo>;
}

/** Public fields for `agent` / `creator` on property API responses. */
export interface PropertyUserSummary {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: UserRole;
}

@Injectable()
export class PropertiesService {
  private mailTransporter: MailTransporter | null = null;

  constructor(
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    private configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  getListingAgentUserId(property: Property): number | null {
    return property.assignedAgentId ?? property.createdBy ?? null;
  }

  private toPropertyUserSummary(user: User): PropertyUserSummary {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    };
  }

  private async attachCreatorsToProperties(
    properties: Property[],
  ): Promise<Array<Property & { creator: PropertyUserSummary | null }>> {
    const creatorIds = [
      ...new Set(
        properties
          .map((p) => p.createdBy)
          .filter((id): id is number => id != null),
      ),
    ];
    const users = await this.usersService.findByIds(creatorIds);
    const byId = new Map(
      users.map((u) => [u.id, this.toPropertyUserSummary(u)]),
    );
    return properties.map((p) => ({
      ...p,
      creator:
        p.createdBy != null ? (byId.get(p.createdBy) ?? null) : null,
    }));
  }

  async create(
    createPropertyDto: CreatePropertyDto,
    userId?: number,
    creatorRole?: string,
  ): Promise<Property> {
    const { assignedAgentId: dtoAgentId, ...rest } = createPropertyDto;
    let assignedAgentId: number | undefined;
    if (creatorRole === 'agent' && userId) {
      assignedAgentId = userId;
    } else if (creatorRole === 'admin' && dtoAgentId != null) {
      assignedAgentId = dtoAgentId;
    }

    const property = this.propertyRepository.create({
      ...rest,
      createdBy: userId,
      assignedAgentId,
    });
    const saved = await this.propertyRepository.save(property);

    // Fire and forget email notification
    this.notifyAdmin(saved).catch((err) =>
      console.error('Failed to notify admin', err),
    );

    if (
      saved.assignedAgentId != null &&
      saved.assignedAgentId !== userId
    ) {
      this.usersService
        .findOne(saved.assignedAgentId)
        .then((agent) => {
          if (agent?.email) {
            this.notifyAssignedAgent(saved, agent.email, agent.name).catch(
              (err) =>
                console.error('Failed to notify assigned agent', err),
            );
          }
        })
        .catch((err) =>
          console.error('Failed to load agent for assignment email', err),
        );
    }

    return saved;
  }

  async approve(id: number, dto: ApprovePropertyDto = {}): Promise<Property> {
    const property = await this.findOne(id);
    property.status = PropertyStatus.APPROVED;
    property.approvedAt = new Date();

    let assignedAgentForEmail: User | null = null;

    if (dto.assignedAgentId != null) {
      const agent = await this.usersService.findOne(dto.assignedAgentId);
      if (agent.role !== UserRole.AGENT) {
        throw new BadRequestException(
          'assignedAgentId must be a user with the agent role.',
        );
      }
      property.assignedAgentId = dto.assignedAgentId;
      assignedAgentForEmail = agent;
    }

    const saved = await this.propertyRepository.save(property);

    if (assignedAgentForEmail?.email) {
      this.notifyAssignedAgent(
        saved,
        assignedAgentForEmail.email,
        assignedAgentForEmail.name,
      ).catch((err) =>
        console.error('Failed to notify assigned agent on approval', err),
      );
    }

    // Notify the creator about the approval
    if (saved.createdBy) {
      this.usersService
        .findOne(saved.createdBy)
        .then((user) => {
          if (user && user.email) {
            this.notifyCreator(saved, user.email, user.name).catch((err) =>
              console.error('Failed to notify creator', err),
            );
          }
        })
        .catch((err) => console.error('Failed to find creator for email', err));
    }

    return saved;
  }

  async reject(id: number, dto: RejectPropertyDto): Promise<Property> {
    const property = await this.findOne(id);
    property.status = PropertyStatus.REJECTED;
    property.approvedAt = null;
    property.reason = dto.reason.trim();

    const saved = await this.propertyRepository.save(property);

    if (saved.createdBy) {
      this.usersService
        .findOne(saved.createdBy)
        .then((user) => {
          if (user?.email) {
            this.notifyCreatorRejected(
              saved,
              user.email,
              user.name,
              saved.reason ?? '',
            ).catch((err) =>
              console.error('Failed to notify creator about rejection', err),
            );
          }
        })
        .catch((err) =>
          console.error('Failed to find creator for rejection email', err),
        );
    }

    return saved;
  }

  private async notifyAdmin(
    property: Property,
    options?: { isResubmission?: boolean },
  ) {
    const admins = await this.usersService.findAllAdmins();
    const adminEmails = admins.map((admin) => admin.email).filter(Boolean) as string[];
    const from = this.configService.get<string>('SMTP_FROM');

    if (!adminEmails.length || !from) return;

    const transporter = this.getMailTransporter();
    const frontendUrl = this.configService.get<string>('CLIENT_APPROVAL_URL');

    const isResubmission = options?.isResubmission === true;
    const subject = isResubmission
      ? 'Listing updated — awaiting review'
      : 'New Property Awaiting Approval';
    const text = isResubmission
      ? `The listing "${property.title}" was updated by the owner and is pending review again. Review it here: ${frontendUrl}/approvals`
      : `A new property "${property.title}" has been submitted and is awaiting approval. View it here: ${frontendUrl}/approvals`;
    const html = isResubmission
      ? `
            <p>The listing <b>${property.title}</b> was <b>updated</b> and is <b>pending review</b> again.</p>
            <a href="${frontendUrl}" style="display:inline-block;padding:10px 15px;background-color:#007bff;color:white;text-decoration:none;border-radius:5px;">Review Properties</a>
          `
      : `
            <p>A new property <b>${property.title}</b> has been submitted and is awaiting approval.</p>
            <a href="${frontendUrl}" style="display:inline-block;padding:10px 15px;background-color:#007bff;color:white;text-decoration:none;border-radius:5px;">Review Properties</a>
          `;

    try {
      for (const adminEmail of adminEmails) {
        await transporter.sendMail({
          from,
          to: adminEmail,
          subject,
          text,
          html,
        });
      }
    } catch (e) {
      console.error('Failed to notify admin via email', e);
    }
  }

  private async notifyCreator(
    property: Property,
    email: string,
    name?: string | null,
  ) {
    const from = this.configService.get<string>('SMTP_FROM');
    if (!from) return;

    const transporter = this.getMailTransporter();
    const propertyUrl = `${this.configService.get<string>('FRONTEND_URL')}/properties/${property.id}`;

    try {
      await transporter.sendMail({
        from,
        to: email,
        subject: 'Property Approved!',
        text: `Congratulations${name ? ` ${name}` : ''}! Your property "${property.title}" has been approved and is now live. View it here: ${propertyUrl}`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #28a745;">Property Approved!</h2>
            <p>Congratulations${name ? ` <b>${name}</b>` : ''},</p>
            <p>Your property <b>${property.title}</b> has been reviewed and approved by our team. It is now live on our platform.</p>
            <p>You can view your property here:</p>
            <a href="${propertyUrl}" style="display:inline-block;padding:10px 20px;background-color:#28a745;color:white;text-decoration:none;border-radius:5px;font-weight:bold;">View Property</a>
            <p style="margin-top: 20px;">Thank you for using our platform!</p>
          </div>
        `,
      });
    } catch (e) {
      console.error('Failed to notify creator via email', e);
    }
  }

  private async notifyCreatorRejected(
    property: Property,
    email: string,
    name: string | null | undefined,
    reason: string,
  ) {
    const from = this.configService.get<string>('SMTP_FROM');
    if (!from) return;

    const transporter = this.getMailTransporter();
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const editUrl = `${frontendUrl}/property/${buildPropertyPath(property.id, property.title)}`;

    try {
      await transporter.sendMail({
        from,
        to: email,
        subject: `Listing not approved: ${property.title}`,
        text: `Hello${name ? ` ${name}` : ''},

Your property listing "${property.title}" was not approved.

Reason provided by our team:
${reason}

You may update your listing and submit it again for review when ready.
${editUrl}`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #c0392b;">Listing not approved</h2>
            <p>Hello${name ? ` <b>${name}</b>` : ''},</p>
            <p>Your property listing <b>${property.title}</b> was not approved.</p>
            <p><b>Reason:</b></p>
            <blockquote style="border-left: 4px solid #c0392b; padding-left: 12px; margin: 12px 0; color: #444;">${escapeHtmlForEmail(reason)}</blockquote>
            <p>You may update your listing and submit it again for review when ready.</p>
            <p><a href="${editUrl}" style="display:inline-block;padding:10px 20px;background-color:#333;color:white;text-decoration:none;border-radius:5px;font-weight:bold;">View listing</a></p>
          </div>
        `,
      });
    } catch (e) {
      console.error('Failed to notify creator about rejection via email', e);
    }
  }

  private async notifyAssignedAgent(
    property: Property,
    email: string,
    name?: string | null,
  ) {
    const from = this.configService.get<string>('SMTP_FROM');
    if (!from) return;

    const transporter = this.getMailTransporter();
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const propertyUrl = `${frontendUrl}/properties/${property.id}`;

    try {
      await transporter.sendMail({
        from,
        to: email,
        subject: `You've been assigned a listing: ${property.title}`,
        text: `Hello${name ? ` ${name}` : ''},

You have been assigned as the listing agent for "${property.title}". You will receive tenant enquiries for this property.

View the listing: ${propertyUrl}`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #007bff;">New listing assignment</h2>
            <p>Hello${name ? ` <b>${name}</b>` : ''},</p>
            <p>You have been assigned as the <b>listing agent</b> for <b>${property.title}</b>. Tenant enquiries for this property will appear in your leads.</p>
            <p><a href="${propertyUrl}" style="display:inline-block;padding:10px 20px;background-color:#007bff;color:white;text-decoration:none;border-radius:5px;font-weight:bold;">View property</a></p>
            <p style="margin-top: 16px; font-size: 14px; color: #666;">If your app has a leads dashboard, open it from your agent account to manage enquiries.</p>
          </div>
        `,
      });
    } catch (e) {
      console.error('Failed to notify assigned agent via email', e);
    }
  }

  private getMailTransporter() {
    if (this.mailTransporter) return this.mailTransporter;
    const host = this.configService.get<string>('SMTP_HOST');
    const port = Number(this.configService.get<string>('SMTP_PORT') || 0);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (!host || !port || !user || !pass) {
      throw new InternalServerErrorException('SMTP configuration missing.');
    }

    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    this.mailTransporter = transport as MailTransporter;
    return this.mailTransporter;
  }

  async findMyProperties(
    userId: number,
  ): Promise<Array<Property & { creator: PropertyUserSummary | null }>> {
    const properties = await this.propertyRepository.find({
      where: { createdBy: userId },
    });
    return this.attachCreatorsToProperties(properties);
  }

  async findAll(): Promise<
    Array<Property & { creator: PropertyUserSummary | null }>
  > {
    const properties = await this.propertyRepository.find();
    return this.attachCreatorsToProperties(properties);
  }

  /** Listings where `assignedAgentId` is one of the given agent user ids (explicit assignment). */
  async findByAssignedAgentIds(agentIds: number[]): Promise<Property[]> {
    if (agentIds.length === 0) {
      return [];
    }
    return this.propertyRepository.find({
      where: { assignedAgentId: In(agentIds) },
      order: { id: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Property> {
    const property = await this.propertyRepository.findOne({ where: { id } });
    if (!property) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }
    return property;
  }

  /** Single property for public/detail API: `agent` (listing) + `creator` (submitter). */
  async findOneWithAgent(id: number): Promise<
    Property & {
      agent: PropertyUserSummary | null;
      creator: PropertyUserSummary | null;
    }
  > {
    const property = await this.findOne(id);
    const agentUserId = this.getListingAgentUserId(property);

    const idsToLoad = new Set<number>();
    if (agentUserId != null) {
      idsToLoad.add(agentUserId);
    }
    if (property.createdBy != null) {
      idsToLoad.add(property.createdBy);
    }

    let userById = new Map<number, PropertyUserSummary>();
    if (idsToLoad.size > 0) {
      const users = await this.usersService.findByIds([...idsToLoad]);
      userById = new Map(
        users.map((u) => [u.id, this.toPropertyUserSummary(u)]),
      );
    }

    const agent =
      agentUserId != null ? (userById.get(agentUserId) ?? null) : null;
    const creator =
      property.createdBy != null
        ? (userById.get(property.createdBy) ?? null)
        : null;

    return { ...property, agent, creator };
  }

  async update(
    id: number,
    updatePropertyDto: UpdatePropertyDto,
    userId: number,
    role: string,
  ): Promise<Property> {
    const property = await this.findOne(id);
    const previousStatus = property.status;
    const previousAssignedId = property.assignedAgentId;

    const isAdmin = role === UserRole.ADMIN;

    if (!isAdmin) {
      if (property.createdBy !== userId) {
        throw new ForbiddenException(
          'You can only update properties you created',
        );
      }
    }

    const dto = { ...updatePropertyDto };
    if (!isAdmin) {
      delete dto.assignedAgentId;
      delete dto.status;
    }

    let agentToNotify: User | null = null;
    if (isAdmin && dto.assignedAgentId !== undefined) {
      if (dto.assignedAgentId != null) {
        const agent = await this.usersService.findOne(dto.assignedAgentId);
        if (agent.role !== UserRole.AGENT) {
          throw new BadRequestException(
            'assignedAgentId must be a user with the agent role.',
          );
        }
        if (dto.assignedAgentId !== previousAssignedId && agent.email) {
          agentToNotify = agent;
        }
      }
    }

    const updatedProperty = Object.assign(property, dto);
    if (!isAdmin) {
      updatedProperty.status = PropertyStatus.PENDING;
    }

    if (updatedProperty.status === PropertyStatus.APPROVED) {
      if (previousStatus !== PropertyStatus.APPROVED) {
        updatedProperty.approvedAt = new Date();
      }
    } else {
      updatedProperty.approvedAt = null;
    }

    const result = await this.propertyRepository.update(id, updatedProperty);
    if (result.affected === 0) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }

    if (agentToNotify?.email) {
      this.notifyAssignedAgent(
        updatedProperty,
        agentToNotify.email,
        agentToNotify.name,
      ).catch((err) =>
        console.error('Failed to notify assigned agent on update', err),
      );
    }

    if (
      !isAdmin &&
      previousStatus !== PropertyStatus.PENDING
    ) {
      this.notifyAdmin(updatedProperty, { isResubmission: true }).catch(
        (err) =>
          console.error('Failed to notify admin about listing resubmission', err),
      );
    }

    return updatedProperty;
  }

  async remove(id: number, userId: number, role?: string): Promise<void> {
    const property = await this.findOne(id);

    if (property.createdBy !== userId && role !== 'admin') {
      throw new ForbiddenException(
        'You can only delete properties that you created',
      );
    }

    await this.propertyRepository.delete(id);
  }


}
