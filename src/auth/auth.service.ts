import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt } from 'crypto';
import { UpdateMeDto } from './dto/update-me.dto';
import { MailService } from '../mail/mail.service';
import { EmailLogStatus } from '../mail/entities/email-log.entity';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { User, UserRole } from '../users/entities/user.entity';
import { parseDurationToSeconds } from '../helper/duration';
import { VerifyPhoneOtpDto } from './dto/verify-phone-otp.dto';
import twilio, { type Twilio } from 'twilio';
import { VendorsService } from '../vendors/vendors.service';
import { BRAND_COLOR, BRAND_ON_COLOR } from '../helper/email-theme';

/** Default fixed OTP when fallback mode is enabled and OTP_FALLBACK_CODE is unset. */
const DEFAULT_OTP_FALLBACK_CODE = '456789';

interface VerificationJwtPayload {
  sub: number;
  email: string;
  type: string;
}

interface RefreshJwtPayload {
  sub: number;
  typ: 'refresh';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private twilioClient: Twilio | null = null;

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private readonly mail: MailService,
    @Inject(forwardRef(() => VendorsService))
    private vendorsService: VendorsService,
  ) {}

  async requestPhoneOtp(phone: string) {
    const normalizedPhone = this.normalizePhone(phone);
    if (!normalizedPhone) {
      throw new BadRequestException(
        'Phone number must be in E.164 format.',
      );
    }

    if (this.isOtpFallbackEnabled()) {
      const fallbackCode = this.getOtpFallbackCode();
      this.logger.warn(
        `OTP fallback enabled: skipping Twilio for ${normalizedPhone}. Use code ${fallbackCode}.`,
      );
      return {
        message: 'OTP sent successfully',
        status: 'fallback',
        code: fallbackCode,
      };
    }

    const verifyServiceSid = this.configService.get<string>(
      'TWILIO_VERIFY_SERVICE_SID',
    );
    if (!verifyServiceSid) {
      throw new BadRequestException(
        'TWILIO_VERIFY_SERVICE_SID must be configured.',
      );
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

      throw new BadRequestException({
        message:
          'Failed to send OTP. Check phone number and Twilio configuration.',
        ...(this.isProductionEnvironment()
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
        'Phone number must be in E.164 format.',
      );
    }

    const code = body.code?.trim();
    if (!code) {
      throw new BadRequestException('OTP code is required.');
    }

    const verifyServiceSid = this.configService.get<string>(
      'TWILIO_VERIFY_SERVICE_SID',
    );
    if (this.isOtpFallbackEnabled()) {
      const fallbackCode = this.getOtpFallbackCode();
      if (code !== fallbackCode) {
        throw new UnauthorizedException('Invalid OTP code.');
      }
      this.logger.warn(
        `OTP fallback accepted for ${normalizedPhone}.`,
      );
    } else {
      if (!verifyServiceSid) {
        throw new BadRequestException(
          'TWILIO_VERIFY_SERVICE_SID must be configured.',
        );
      }

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
        throw new BadRequestException({
          message: 'OTP verification failed.',
          ...(this.isProductionEnvironment()
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
      const updates: UpdateUserDto = {
        isPhoneVerified: true,
        name: body.name?.trim() || user.name || undefined,
      };
      if (body.role && !user.role) {
        updates.role = body.role;
      }
      user = await this.usersService.update(user.id, updates);
    }

    const effectiveRole = user.role ?? body.role ?? UserRole.TENANT;
    if (effectiveRole === UserRole.VENDOR) {
      await this.vendorsService.ensureProfileForUser(user.id, {
        businessName: body.businessName,
        categoryIds: body.categoryIds,
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
    const normalizedPhone = this.normalizePhone(body.phone);

    if (normalizedEmail) {
      const existingByEmail =
        await this.usersService.findByEmail(normalizedEmail);
      if (existingByEmail && existingByEmail.id !== userId) {
        throw new ConflictException('Email already exists');
      }
    }

    if (normalizedPhone) {
      const existingByPhone = await this.usersService.findByPhone(normalizedPhone);
      if (existingByPhone && existingByPhone.id !== userId) {
        throw new ConflictException('Phone number already exists');
      }
    }

    const normalizedAvatarUrl =
      body.avatarUrl === undefined
        ? undefined
        : body.avatarUrl === null || body.avatarUrl.trim() === ''
          ? null
          : body.avatarUrl.trim();

    const next = {
      ...current,
      ...body,
      email: normalizedEmail ?? current.email,
      name: body.name?.trim() ?? current.name,
      avatarUrl:
        normalizedAvatarUrl === undefined
          ? current.avatarUrl
          : normalizedAvatarUrl,
      locationAddress: body.locationAddress?.trim() ?? current.locationAddress,
      locationCity: body.locationCity?.trim() ?? current.locationCity,
      locationState: body.locationState?.trim() ?? current.locationState,
      locationCountry: body.locationCountry?.trim() ?? current.locationCountry,
    };

    const onboardingCompleted = this.isOnboardingComplete(next);

    // Build the patch conditionally so we never send `undefined` for fields
    // the client didn't include. `usersService.update` does `Object.assign`,
    // and assigning `undefined` would wipe the existing column value (e.g.
    // saving role-only would erase name + location).
    const patch: UpdateUserDto = { onboardingCompleted };
    if (body.role !== undefined) patch.role = body.role;
    if (body.phone !== undefined) patch.phone = body.phone;
    if (body.latitude !== undefined) patch.latitude = body.latitude;
    if (body.longitude !== undefined) patch.longitude = body.longitude;
    if (body.name !== undefined) patch.name = body.name.trim();
    if (body.locationAddress !== undefined)
      patch.locationAddress = body.locationAddress.trim();
    if (body.locationCity !== undefined)
      patch.locationCity = body.locationCity.trim();
    if (body.locationState !== undefined)
      patch.locationState = body.locationState.trim();
    if (body.locationCountry !== undefined)
      patch.locationCountry = body.locationCountry.trim();
    if (normalizedEmail !== undefined) {
      patch.email = normalizedEmail;
      patch.isEmailVerified = Boolean(normalizedEmail);
      patch.pendingEmail = null;
      patch.emailOtpHash = null;
      patch.emailOtpExpiresAt = null;
    }
    if (normalizedAvatarUrl !== undefined) {
      patch.avatarUrl = normalizedAvatarUrl;
    }

    const user = await this.usersService.update(userId, patch);

    return this.buildAuthResponse(user);
  }

  async deleteMe(userId: number) {
    await this.usersService.remove(userId);
    return { message: 'Account deleted successfully' };
  }

  async adminLoginAs(targetUserId: number) {
    const user = await this.usersService.findOne(targetUserId);
    if (!user) {
      throw new NotFoundException('Target user not found');
    }
    if (user.role === UserRole.VENDOR) {
      await this.vendorsService.ensureProfileForUser(user.id);
    }
    return this.buildAuthResponse(user);
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
      ...(this.isOtpFallbackEnabled() ? { devCode: code } : {}),
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

  /** Exchange refresh JWT for new access + refresh tokens (cookie set in controller). */
  async refreshWithRefreshToken(refreshToken: string) {
    const secret = this.getRefreshJwtSecret();
    let payload: RefreshJwtPayload;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret,
      }) as RefreshJwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.typ !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.usersService.findOne(payload.sub);
    return this.buildAuthResponse(user);
  }

  /** When true, frontend + API share a parent domain (e.g. www + api); set `COOKIE_DOMAIN`. */
  private isSameDomainDeployment(): boolean {
    const raw = this.configService.get<string>('IS_SAME_DOMAIN');
    if (raw == null || raw.trim() === '') return false;
    const normalized = raw.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }

  /**
   * Parent domain for `Set-Cookie` when `IS_SAME_DOMAIN=true` (e.g. `.findmypropertys.com`
   * so `fmp-rt` is visible on both `www` and `api` subdomains).
   */
  private getCookieDomain(): string | undefined {
    if (!this.isSameDomainDeployment()) return undefined;

    const configured = this.configService.get<string>('COOKIE_DOMAIN')?.trim();
    if (!configured) {
      this.logger.warn(
        'IS_SAME_DOMAIN=true but COOKIE_DOMAIN is unset — cookies stay host-only on the API host',
      );
      return undefined;
    }

    if (/localhost|127\.0\.0\.1/i.test(configured)) {
      return undefined;
    }

    return configured.startsWith('.') ? configured : `.${configured}`;
  }

  private getAuthCookieBaseOptions(): {
    secure: boolean;
    sameSite: 'lax' | 'strict' | 'none';
    maxAge: number;
    path: string;
    domain?: string;
  } {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';
    const raw = (
      this.configService.get<string>('REFRESH_COOKIE_SAME_SITE') || 'lax'
    ).toLowerCase();
    const sameSite: 'lax' | 'strict' | 'none' =
      raw === 'none' || raw === 'strict' ? raw : 'lax';
    const domain = this.getCookieDomain();

    return {
      secure: isProd || sameSite === 'none',
      sameSite,
      maxAge: this.getRefreshCookieMaxAgeMs(),
      path: '/',
      ...(domain ? { domain } : {}),
    };
  }

  /** Options for `Set-Cookie` on login / refresh (HTTP-only refresh token). */
  getRefreshCookieOptions(): {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'lax' | 'strict' | 'none';
    maxAge: number;
    path: string;
    domain?: string;
  } {
    return {
      ...this.getAuthCookieBaseOptions(),
      httpOnly: true,
    };
  }

  /**
   * Readable role cookie (not HTTP-only) so the client / edge middleware can route by role.
   * Same TTL and site rules as the refresh cookie.
   */
  getRoleCookieOptions(): {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'lax' | 'strict' | 'none';
    maxAge: number;
    path: string;
    domain?: string;
  } {
    return {
      ...this.getAuthCookieBaseOptions(),
      httpOnly: false,
    };
  }

  getClearRefreshCookieOptions(): {
    path: string;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'lax' | 'strict' | 'none';
    domain?: string;
  } {
    const base = this.getAuthCookieBaseOptions();
    return {
      path: base.path,
      httpOnly: true,
      secure: base.secure,
      sameSite: base.sameSite,
      ...(base.domain ? { domain: base.domain } : {}),
    };
  }

  getClearRoleCookieOptions(): {
    path: string;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'lax' | 'strict' | 'none';
    domain?: string;
  } {
    const base = this.getAuthCookieBaseOptions();
    return {
      path: base.path,
      httpOnly: false,
      secure: base.secure,
      sameSite: base.sameSite,
      ...(base.domain ? { domain: base.domain } : {}),
    };
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
      refresh_token: this.signRefreshToken(user.id),
      user: publicUser,
    };
  }

  private signRefreshToken(userId: number): string {
    const secret = this.getRefreshJwtSecret();
    const expiresIn =
      parseDurationToSeconds(
        this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d',
      ) ?? 7 * 24 * 60 * 60;
    return this.jwtService.sign(
      { sub: userId, typ: 'refresh' },
      { secret, expiresIn },
    );
  }

  private getRefreshJwtSecret(): string {
    return (
      this.configService.get<string>('JWT_REFRESH_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'secretKey'
    );
  }

  private getRefreshCookieMaxAgeMs(): number {
    const fromEnv = this.configService.get<string>('REFRESH_COOKIE_MAX_AGE_MS');
    if (fromEnv != null && fromEnv !== '' && Number.isFinite(Number(fromEnv))) {
      return Number(fromEnv);
    }
    return 7 * 24 * 60 * 60 * 1000;
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
    const frontendUrl =
      this.configService.get<string>('CLIENT_URL') || 'http://localhost:3000';
    const verificationLink = `${frontendUrl}/verify-agent?token=${token}`;

      const result = await this.mail.send({
        templateKey: 'auth.agent_verify',
        feature: 'auth',
        triggerEvent: 'agent_created',
        to: email,
        subject: 'Welcome to Find My Property - Verify Your Account',
        text: `Hello ${name || 'Agent'},\n\nWelcome to Find My Property! Please verify your account by clicking the following link: ${verificationLink}`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2>Welcome to Find My Property!</h2>
            <p>Hello ${name || 'Agent'},</p>
            <p>Your agent account has been created. Please click the button below to verify your email address and activate your account:</p>
            <a href="${verificationLink}" style="display:inline-block;padding:10px 20px;background-color:${BRAND_COLOR};color:${BRAND_ON_COLOR};text-decoration:none;border-radius:5px;font-weight:bold;">Verify Account</a>
            <p style="margin-top: 20px;">If the button above doesn't work, you can also copy and paste the following link into your browser:</p>
            <p>${verificationLink}</p>
            <p>This link will expire in 24 hours.</p>
          </div>
        `,
        recipientRole: 'agent',
      });
      if (result.status !== EmailLogStatus.SENT) {
        throw new InternalServerErrorException(
          'Failed to send verification email.',
        );
      }
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
      avatarUrl: user.avatarUrl ?? null,
      role: this.normalizeRole(user.role),
      // `defaultRole` is the user's *permanent* role assigned at signup
      // (admins keep `admin` here even after switching their runtime `role`
      // via the Super Admin override). Falling back to `user.role` only
      // covers legacy rows created before the column existed.
      defaultRole: this.normalizeRole(user.defaultRole ?? user.role),
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
    const result = await this.mail.send({
      templateKey: 'auth.email_otp',
      feature: 'auth',
      triggerEvent: 'otp_requested',
      to: email,
      subject: 'Verify your email for Find My Property',
      text: `Your verification code is ${code}. It expires in ${this.getOtpTtlMinutes()} minutes.`,
      html: `<p>Your verification code is <b>${code}</b>.</p><p>It expires in ${this.getOtpTtlMinutes()} minutes.</p>`,
      createAlert: false,
    });
    if (result.status !== EmailLogStatus.SENT) {
      throw new InternalServerErrorException(
        'Failed to send email OTP. Please try again.',
      );
    }
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

  private isDevelopmentEnvironment() {
    return this.configService.get<string>('NODE_ENV') === 'development';
  }

  /**
   * When true, phone OTP skips Twilio and accepts a fixed code.
   * Set OTP_FALLBACK_ENABLED=true in .env, or leave unset to auto-enable in NODE_ENV=development.
   */
  private isOtpFallbackEnabled() {
    const flag = this.configService.get<string>('OTP_FALLBACK_ENABLED')?.trim();
    if (flag) {
      const enabled = ['1', 'true', 'yes', 'on'].includes(flag.toLowerCase());
      if (enabled && this.isProductionEnvironment()) {
        this.logger.warn(
          'OTP_FALLBACK_ENABLED is on in production — use only for staging.',
        );
      }
      return enabled;
    }
    return this.isDevelopmentEnvironment();
  }

  private getOtpFallbackCode() {
    const configured = this.configService
      .get<string>('OTP_FALLBACK_CODE')
      ?.trim();
    if (configured && /^\d{4,8}$/.test(configured)) {
      return configured;
    }
    return DEFAULT_OTP_FALLBACK_CODE;
  }

  private isProductionEnvironment() {
    return this.configService.get<string>('NODE_ENV') === 'production';
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
      normalized === 'tenant' ||
      normalized === 'vendor'
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
