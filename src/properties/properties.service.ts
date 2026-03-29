import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { CreatePropertyDto, PropertyStatus } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { Property } from './entities/property.entity';
import { UsersService } from '../users/users.service';

interface MailTransporter {
  sendMail(
    options: nodemailer.SendMailOptions,
  ): Promise<nodemailer.SentMessageInfo>;
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

  async create(
    createPropertyDto: CreatePropertyDto,
    userId?: number,
  ): Promise<Property> {
    const property = this.propertyRepository.create({
      ...createPropertyDto,
      createdBy: userId,
    });
    const saved = await this.propertyRepository.save(property);

    // Fire and forget email notification
    this.notifyAdmin(saved).catch((err) =>
      console.error('Failed to notify admin', err),
    );

    return saved;
  }

  async approve(id: number): Promise<Property> {
    const property = await this.findOne(id);
    property.status = PropertyStatus.APPROVED;
    const saved = await this.propertyRepository.save(property);

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

  private async notifyAdmin(property: Property) {
    const adminEmail =
      this.configService.get<string>('ADMIN_EMAIL') || 'admin@example.com';
    const from = this.configService.get<string>('SMTP_FROM');

    if (!adminEmail || !from) return; // Silent abort if not configured

    const transporter = this.getMailTransporter();
    const frontendUrl = this.configService.get<string>('FRONTEND_APPROVAL_URL');

    try {
      await transporter.sendMail({
        from,
        to: adminEmail,
        subject: 'New Property Awaiting Approval',
        text: `A new property "${property.title}" has been submitted and is awaiting approval. View it here: ${frontendUrl}/approvals`,
        html: `
          <p>A new property <b>${property.title}</b> has been submitted and is awaiting approval.</p>
          <a href="${frontendUrl}" style="display:inline-block;padding:10px 15px;background-color:#007bff;color:white;text-decoration:none;border-radius:5px;">Review Properties</a>
        `,
      });
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

  async findMyProperties(userId: number): Promise<Property[]> {
    return await this.propertyRepository.find({ where: { createdBy: userId } });
  }

  async findAll(): Promise<Property[]> {
    return await this.propertyRepository.find();
  }

  async findOne(id: number): Promise<Property> {
    const property = await this.propertyRepository.findOne({ where: { id } });
    if (!property) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }
    return property;
  }

  async update(
    id: number,
    updatePropertyDto: UpdatePropertyDto,
  ): Promise<Property> {
    const property = await this.findOne(id);
    const updatedProperty = Object.assign(property, updatePropertyDto);
    const result = await this.propertyRepository.update(id, updatedProperty);
    if (result.affected === 0) {
      throw new NotFoundException(`Property with ID ${id} not found`);
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
