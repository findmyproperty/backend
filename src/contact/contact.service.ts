import {
  BadRequestException,
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
    await this.verifyRecaptchaIfConfigured(dto.recaptchaToken);

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

  /** When `RECAPTCHA_SECRET_KEY` or `CONTACT_RECAPTCHA_SECRET` is set, token is required and verified with Google. */
  private async verifyRecaptchaIfConfigured(
    token: string | undefined,
  ): Promise<void> {
    const secret =
      this.configService.get<string>('RECAPTCHA_SECRET_KEY')?.trim() ||
      this.configService.get<string>('CONTACT_RECAPTCHA_SECRET')?.trim();
    if (!secret) {
      return;
    }

    const response = token?.trim();
    if (!response) {
      throw new BadRequestException('Verification required.');
    }

    const body = new URLSearchParams();
    body.set('secret', secret);
    body.set('response', response);

    let data: {
      success?: boolean;
      score?: number;
      'error-codes'?: string[];
    };

    try {
      const res = await fetch(
        'https://www.google.com/recaptcha/api/siteverify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        },
      );
      if (!res.ok) {
        throw new BadRequestException('Verification service unavailable.');
      }
      data = (await res.json()) as typeof data;
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      console.error('reCAPTCHA verify request failed', e);
      throw new BadRequestException('Verification service unavailable.');
    }

    if (!data.success) {
      throw new BadRequestException('Verification failed. Please try again.');
    }

    const minScoreRaw = this.configService.get<string>(
      'CONTACT_RECAPTCHA_MIN_SCORE',
    );
    const minScore =
      minScoreRaw != null && minScoreRaw !== ''
        ? Number(minScoreRaw)
        : 0.5;

    if (
      typeof data.score === 'number' &&
      Number.isFinite(minScore) &&
      data.score < minScore
    ) {
      throw new BadRequestException('Verification failed. Please try again.');
    }
  }
}
