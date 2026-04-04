import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt } from 'crypto';
import nodemailer from 'nodemailer';
import { UpdateMeDto } from './dto/update-me.dto';
import { User, UserRole } from '../users/entities/user.entity';
import { VerifyPhoneOtpDto } from './dto/verify-phone-otp.dto';
import twilio, { type Twilio } from 'twilio';

/** Fallback OTP when Twilio is not configured (e.g. local dev). */
const FALLBACK_OTP_CODE = '4567';

/** Mail transporter shape used here to avoid nodemailer typings issues. */
interface MailTransporter {
  sendMail(
    options: nodemailer.SendMailOptions,
  ): Promise<nodemailer.SentMessageInfo>;
}

interface VerificationJwtPayload {
  sub: number;
  email: string;
  type: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private mailTransporter: MailTransporter | null = null;
  private twilioClient: Twilio | null = null;

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async requestPhoneOtp(phone: string) {
    const normalizedPhone = this.normalizePhone(phone);
    if (!normalizedPhone) {
      throw new BadRequestException(
        'Phone number must be in E.164 format, e.g. +919876543210.',
      );
    }

    const verifyServiceSid = this.configService.get<string>(
      'TWILIO_VERIFY_SERVICE_SID',
    );
    if (!verifyServiceSid) {
      this.logger.warn(
        'Twilio not configured; using fallback OTP. Use code 4567 to verify.',
      );
      return {
        message: 'OTP sent successfully',
        status: 'fallback',
      };
    }

    try {
      const verification = await this.getTwilioClient()
        .verify.v2.services(verifyServiceSid)
        .verifications.create({
          to: normalizedPhone,
          channel: 'sms',
        });
      
      return {
        message: 'OTP sent successfully',
        status: verification.status,
      };
    } catch (error) {
      const twilioError = error as {
        code?: number;
        message?: string;
        status?: number;
        moreInfo?: string;
      };
      this.logger.error(
        `Twilio OTP send failed for ${normalizedPhone}. code=${twilioError.code ?? 'unknown'} status=${twilioError.status ?? 'unknown'} message=${twilioError.message ?? 'unknown'}`,
      );

      const isProd =
      this.configService.get<string>('NODE_ENV') === 'production';
      if (!isProd) {
        this.logger.warn(
          'Fallback OTP sent. Check phone number and Twilio configuration.',
        );
        return {
          message: 'Fallback OTP sent. Check phone number and Twilio configuration.',
          status: 'warning',
          code: FALLBACK_OTP_CODE,
        };
      }


      throw new BadRequestException({
        message:
          'Failed to send OTP. Check phone number and Twilio configuration.',
        ...(isProd
          ? {}
          : {
              twilioCode: twilioError.code ?? null,
              twilioStatus: twilioError.status ?? null,
              twilioMessage: twilioError.message ?? null,
              twilioMoreInfo: twilioError.moreInfo ?? null,
            }),
      });
    }
  }

  async verifyPhoneOtp(body: VerifyPhoneOtpDto) {
    const normalizedPhone = this.normalizePhone(body.phone);
    if (!normalizedPhone) {
      throw new BadRequestException(
        'Phone number must be in E.164 format, e.g. +919876543210.',
      );
    }

    const code = body.code?.trim();
    if (!code) {
      throw new BadRequestException('OTP code is required.');
    }

    const verifyServiceSid = this.configService.get<string>(
      'TWILIO_VERIFY_SERVICE_SID',
    );
    const useFallbackOtp = !verifyServiceSid;
    if (useFallbackOtp) {
      if (code !== FALLBACK_OTP_CODE) {
        throw new UnauthorizedException('Invalid OTP code.');
      }
      // Fallback OTP accepted; continue to find/create user and issue tokens
    } else if (code === FALLBACK_OTP_CODE) {
      // Twilio is configured but user sent fallback code — still accept it for dev convenience
      this.logger.warn(
        `Fallback OTP ${FALLBACK_OTP_CODE} accepted for ${normalizedPhone}.`,
      );
      // Continue to find/create user and issue tokens
    } else {
      try {
        const verificationCheck = await this.getTwilioClient()
          .verify.v2.services(verifyServiceSid)
          .verificationChecks.create({
            to: normalizedPhone,
            code,
          });

        if (verificationCheck.status !== 'approved') {
          throw new UnauthorizedException('Invalid OTP code.');
        }
      } catch (error) {
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        const twilioError = error as {
          code?: number;
          message?: string;
          status?: number;
          moreInfo?: string;
        };
        this.logger.error(
          `Twilio OTP verify failed for ${normalizedPhone}. code=${twilioError.code ?? 'unknown'} status=${twilioError.status ?? 'unknown'} message=${twilioError.message ?? 'unknown'}`,
        );
        const isProd =
          this.configService.get<string>('NODE_ENV') === 'production';
        throw new BadRequestException({
          message: 'OTP verification failed.',
          ...(isProd
            ? {}
            : {
                twilioCode: twilioError.code ?? null,
                twilioStatus: twilioError.status ?? null,
                twilioMessage: twilioError.message ?? null,
                twilioMoreInfo: twilioError.moreInfo ?? null,
              }),
        });
      }
    }

    let user = await this.usersService.findByPhone(normalizedPhone);
    if (!user) {
      user = await this.usersService.create({
        name: body.name?.trim() || `User ${normalizedPhone.slice(-4)}`,
        phone: normalizedPhone,
        role: body.role || UserRole.TENANT,
        isPhoneVerified: true,
        onboardingCompleted: false,
      });
    } else {
      user = await this.usersService.update(user.id, {
        isPhoneVerified: true,
        name: body.name?.trim() || user.name || undefined,
      });
    }

    return this.buildAuthResponse(user);
  }

  async getMe(userId: number) {
    const user = await this.usersService.findOne(userId);
    return { user: this.toPublicUser(user) };
  }

  async updateMe(userId: number, body: UpdateMeDto) {
    const current = await this.usersService.findOne(userId);
    const normalizedEmail = this.normalizeEmail(body.email);

    if (normalizedEmail) {
      const existingByEmail =
        await this.usersService.findByEmail(normalizedEmail);
      if (existingByEmail && existingByEmail.id !== userId) {
        throw new ConflictException('Email already exists');
      }
    }

    const next = {
      ...current,
      ...body,
      email: normalizedEmail ?? current.email,
      name: body.name?.trim() ?? current.name,
      locationAddress: body.locationAddress?.trim() ?? current.locationAddress,
      locationCity: body.locationCity?.trim() ?? current.locationCity,
      locationState: body.locationState?.trim() ?? current.locationState,
      locationCountry: body.locationCountry?.trim() ?? current.locationCountry,
    };

    const onboardingCompleted = this.isOnboardingComplete(next);
    const user = await this.usersService.update(userId, {
      ...body,
      ...(normalizedEmail !== undefined
        ? {
            email: normalizedEmail,
            isEmailVerified: Boolean(normalizedEmail),
            pendingEmail: null,
            emailOtpHash: null,
            emailOtpExpiresAt: null,
          }
        : {}),
      name: body.name?.trim(),
      locationAddress: body.locationAddress?.trim(),
      locationCity: body.locationCity?.trim(),
      locationState: body.locationState?.trim(),
      locationCountry: body.locationCountry?.trim(),
      onboardingCompleted,
    });

    return this.buildAuthResponse(user);
  }

  async deleteMe(userId: number) {
    await this.usersService.remove(userId);
    return { message: 'Account deleted successfully' };
  }

  async requestEmailOtp(userId: number, email: string) {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) {
      throw new BadRequestException('Valid email is required.');
    }

    const user = await this.usersService.findOne(userId);
    const existingEmailUser =
      await this.usersService.findByEmail(normalizedEmail);
    if (existingEmailUser && existingEmailUser.id !== userId) {
      throw new ConflictException('Email already exists');
    }

    const code = String(randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + this.getOtpTtlMs());
    const hash = this.hashEmailOtp(normalizedEmail, code);

    await this.usersService.update(userId, {
      pendingEmail: normalizedEmail,
      emailOtpHash: hash,
      emailOtpExpiresAt: expiresAt,
      isEmailVerified:
        user.email && this.normalizeEmail(user.email) === normalizedEmail
          ? user.isEmailVerified
          : false,
    });

    await this.sendEmailOtp(normalizedEmail, code);

    return {
      message: 'OTP sent to email address',
      ...(this.configService.get<string>('NODE_ENV') !== 'production'
        ? { devCode: code }
        : {}),
    };
  }

  async verifyEmailOtp(userId: number, email: string, code: string) {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) {
      throw new BadRequestException('Valid email is required.');
    }

    const user = await this.usersService.findOneWithEmailOtp(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (
      !user.pendingEmail ||
      this.normalizeEmail(user.pendingEmail) !== normalizedEmail
    ) {
      throw new BadRequestException(
        'Email does not match pending verification email.',
      );
    }

    if (!user.emailOtpHash || !user.emailOtpExpiresAt) {
      throw new BadRequestException('OTP not requested or expired.');
    }

    if (user.emailOtpExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('OTP expired. Request a new code.');
    }

    const expectedHash = this.hashEmailOtp(normalizedEmail, code.trim());
    if (expectedHash !== user.emailOtpHash) {
      throw new BadRequestException('Invalid OTP code.');
    }

    const updated = await this.usersService.update(userId, {
      email: normalizedEmail,
      pendingEmail: null,
      emailOtpHash: null,
      emailOtpExpiresAt: null,
      isEmailVerified: true,
      onboardingCompleted: this.isOnboardingComplete({
        ...user,
        email: normalizedEmail,
        isEmailVerified: true,
      }),
    });

    return this.buildAuthResponse(updated);
  }

  private buildAuthResponse(user: User) {
    const publicUser = this.toPublicUser(user);
    const payload = {
      sub: publicUser.id,
      role: publicUser.role,
      phone: publicUser.phone ?? undefined,
      email: publicUser.email ?? undefined,
      onboardingCompleted: publicUser.onboardingCompleted,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: publicUser,
    };
  }

  generateVerificationToken(userId: number, email: string): string {
    const payload = { sub: userId, email, type: 'verification' };
    return this.jwtService.sign(payload, { expiresIn: '24h' });
  }

  async verifyAccount(token: string) {
    try {
      const payload = this.jwtService.verify<VerificationJwtPayload>(token);
      if (payload.type !== 'verification') {
        throw new BadRequestException('Invalid token type');
      }

      const user = await this.usersService.findOne(payload.sub);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      await this.usersService.update(user.id, {
        isEmailVerified: true,
      });

      return { message: 'Account verified successfully' };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new BadRequestException('Invalid or expired verification token');
    }
  }

  async sendAgentVerificationEmail(
    email: string,
    name: string | null,
    token: string,
  ) {
    try {
    const from = this.configService.get<string>('SMTP_FROM');
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const verificationLink = `${frontendUrl}/verify-agent?token=${token}`;

    if (!from) {
      throw new BadRequestException('SMTP_FROM is not configured.');
    }

    const transporter = this.getMailTransporter();

      await transporter.sendMail({
        from,
        to: email,
        subject: 'Welcome to Find My Property - Verify Your Account',
        text: `Hello ${name || 'Agent'},\n\nWelcome to Find My Property! Please verify your account by clicking the following link: ${verificationLink}`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2>Welcome to Find My Property!</h2>
            <p>Hello ${name || 'Agent'},</p>
            <p>Your agent account has been created. Please click the button below to verify your email address and activate your account:</p>
            <a href="${verificationLink}" style="display:inline-block;padding:10px 20px;background-color:#007bff;color:white;text-decoration:none;border-radius:5px;font-weight:bold;">Verify Account</a>
            <p style="margin-top: 20px;">If the button above doesn't work, you can also copy and paste the following link into your browser:</p>
            <p>${verificationLink}</p>
            <p>This link will expire in 24 hours.</p>
          </div>
        `,
      });
    } catch (e) {
      this.logger.error(
        `Failed to send agent verification email to ${email}`,
        e,
      );
      throw new InternalServerErrorException(
          'Failed to send verification email.',
        );
    }
  }

  private toPublicUser(user: User) {
    return {
      id: user.id,
      name:
        user.name?.trim() ||
        (user.phone ? `User ${user.phone.slice(-4)}` : 'User'),
      email: user.email ?? null,
      pendingEmail: user.pendingEmail ?? null,
      phone: user.phone ?? null,
      role: this.normalizeRole(user.role),
      isEmailVerified: Boolean(user.isEmailVerified),
      isPhoneVerified: Boolean(user.isPhoneVerified),
      onboardingCompleted: Boolean(user.onboardingCompleted),
      locationAddress: user.locationAddress ?? null,
      locationCity: user.locationCity ?? null,
      locationState: user.locationState ?? null,
      locationCountry: user.locationCountry ?? null,
      latitude:
        user.latitude !== null && user.latitude !== undefined
          ? Number(user.latitude)
          : null,
      longitude:
        user.longitude !== null && user.longitude !== undefined
          ? Number(user.longitude)
          : null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private isOnboardingComplete(user: Partial<User>) {
    return Boolean(
      user.email?.trim() &&
      user.name?.trim() &&
      user.locationCity?.trim() &&
      user.locationCountry?.trim(),
    );
  }

  private async sendEmailOtp(email: string, code: string) {
    const from = this.configService.get<string>('SMTP_FROM');
    if (!from) {
      throw new BadRequestException('SMTP_FROM is not configured.');
    }

    const transporter = this.getMailTransporter();
    try {
      await transporter.sendMail({
        from,
        to: email,
        subject: 'Verify your email for Find My Property',
        text: `Your verification code is ${code}. It expires in ${this.getOtpTtlMinutes()} minutes.`,
        html: `<p>Your verification code is <b>${code}</b>.</p><p>It expires in ${this.getOtpTtlMinutes()} minutes.</p>`,
      });
    } catch {
      throw new InternalServerErrorException(
        'Failed to send email OTP. Please try again.',
      );
    }
  }

  private getMailTransporter() {
    if (this.mailTransporter) {
      return this.mailTransporter;
    }

    const host = this.configService.get<string>('SMTP_HOST');
    const port = Number(this.configService.get<string>('SMTP_PORT') || 0);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (!host || !port || !user || !pass) {
      throw new BadRequestException(
        'SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS must be configured for email verification.',
      );
    }

    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    this.mailTransporter = transport;

    return this.mailTransporter;
  }

  private getTwilioClient() {
    if (this.twilioClient) {
      return this.twilioClient;
    }

    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    if (!accountSid || !authToken) {
      throw new BadRequestException(
        'TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be configured.',
      );
    }

    this.twilioClient = twilio(accountSid, authToken);
    return this.twilioClient;
  }

  private hashEmailOtp(email: string, code: string) {
    const secret =
      this.configService.get<string>('EMAIL_OTP_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'email-otp-secret';

    return createHash('sha256')
      .update(`${email}:${code}:${secret}`)
      .digest('hex');
  }

  private getOtpTtlMinutes() {
    const configured = Number(
      this.configService.get<string>('EMAIL_OTP_TTL_MINUTES'),
    );
    if (Number.isFinite(configured) && configured > 0) {
      return configured;
    }
    return 10;
  }

  private getOtpTtlMs() {
    return this.getOtpTtlMinutes() * 60 * 1000;
  }

  private normalizeRole(role?: string): string {
    const normalized = role?.trim().toLowerCase();
    if (!normalized) {
      return 'tenant';
    }
    if (
      normalized === 'admin' ||
      normalized === 'agent' ||
      normalized === 'tenant'
    ) {
      return normalized;
    }
    return 'tenant';
  }

  private normalizeEmail(email?: string | null) {
    const normalized = email?.trim().toLowerCase();
    return normalized || undefined;
  }

  private normalizePhone(phone?: string | null) {
    if (!phone) {
      return undefined;
    }
    const trimmed = phone.trim();
    if (!trimmed) {
      return undefined;
    }
    if (trimmed.startsWith('+') && /^\+\d{8,15}$/.test(trimmed)) {
      return trimmed;
    }
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length === 10) {
      return `+91${digits}`;
    }
    if (digits.length >= 8 && digits.length <= 15) {
      return `+${digits}`;
    }
    return undefined;
  }
}
