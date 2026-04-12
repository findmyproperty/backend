import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { UsersService } from '../users/users.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { escapeHtmlForEmail } from '../helper/escape-html';

interface MailTransporter {
  sendMail(
    options: nodemailer.SendMailOptions,
  ): Promise<nodemailer.SentMessageInfo>;
}

@Injectable()
export class ContactService {
  private mailTransporter: MailTransporter | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async sendToAdmins(dto: CreateContactDto): Promise<{ message: string }> {
    const admins = await this.usersService.findAllAdmins();
    const adminEmails = admins
      .map((a) => a.email)
      .filter((e): e is string => Boolean(e?.trim()));

    if (adminEmails.length === 0) {
      throw new ServiceUnavailableException(
        'Contact is unavailable: no admin email on file.',
      );
    }

    const from = this.configService.get<string>('SMTP_FROM');
    if (!from) {
      throw new InternalServerErrorException('SMTP is not configured.');
    }

    const subject =
      (dto.subject?.trim() || 'Website contact form') +
      ` — ${dto.name.trim()}`;

    const safeName = escapeHtmlForEmail(dto.name.trim());
    const safeEmail = escapeHtmlForEmail(dto.email.trim());
    const safeBody = escapeHtmlForEmail(dto.message.trim()).replace(
      /\r?\n/g,
      '<br/>',
    );

    const text = `Contact form submission

From: ${dto.name.trim()} <${dto.email.trim()}>

${dto.message.trim()}
`;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="margin-top:0;">Contact form</h2>
        <p><b>From:</b> ${safeName}<br/>
        <b>Reply-to:</b> <a href="mailto:${encodeURI(dto.email.trim())}">${safeEmail}</a></p>
        <hr style="border:none;border-top:1px solid #ddd;margin:16px 0;" />
        <div>${safeBody}</div>
      </div>
    `;

    const transporter = this.getMailTransporter();

    try {
      for (const to of adminEmails) {
        await transporter.sendMail({
          from,
          to,
          replyTo: dto.email.trim(),
          subject,
          text,
          html,
        });
      }
    } catch (e) {
      console.error('Contact form email failed', e);
      throw new InternalServerErrorException(
        'Could not send your message. Please try again later.',
      );
    }

    return { message: 'Your message has been sent.' };
  }

  private getMailTransporter(): MailTransporter {
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
}
