import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { UpdateMeDto } from './dto/update-me.dto';
import { RequestPhoneOtpDto } from './dto/request-phone-otp.dto';
import { VerifyPhoneOtpDto } from './dto/verify-phone-otp.dto';
import { AdminLoginAsDto } from './dto/admin-login-as.dto';
import { LoginPasswordDto } from './dto/login-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  ForgotPasswordRequestDto,
  ForgotPasswordResetDto,
  ForgotPasswordVerifyDto,
} from './dto/forgot-password.dto';

import type { Request, Response } from 'express';

const REFRESH_TOKEN_COOKIE = 'fmp-rt';
const ROLE_COOKIE = 'fmp-role';

interface RequestWithUser extends Request {
  user?: {
    userId: number;
    role: string;
  };
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Get('verify')
  async verifyAccount(@Query('token') token: string) {
    return this.authService.verifyAccount(token);
  }

  @Post('phone-otp/request')
  async requestPhoneOtp(@Body() body: RequestPhoneOtpDto) {
    return this.authService.requestPhoneOtp(body.phone, body.intent);
  }

  @Post('phone-otp/verify')
  async verifyPhoneOtp(
    @Body() body: VerifyPhoneOtpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyPhoneOtp(body);
    res.cookie(
      REFRESH_TOKEN_COOKIE,
      result.refresh_token,
      this.authService.getRefreshCookieOptions(),
    );
    res.cookie(
      ROLE_COOKIE,
      result.user.role,
      this.authService.getRoleCookieOptions(),
    );
    return { access_token: result.access_token, user: result.user };
  }

  @Post('login')
  async loginWithPassword(
    @Body() body: LoginPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.loginWithPassword(
      body.phone,
      body.password,
    );
    res.cookie(
      REFRESH_TOKEN_COOKIE,
      result.refresh_token,
      this.authService.getRefreshCookieOptions(),
    );
    res.cookie(
      ROLE_COOKIE,
      result.user.role,
      this.authService.getRoleCookieOptions(),
    );
    return { access_token: result.access_token, user: result.user };
  }

  @UseGuards(JwtAuthGuard)
  @Post('password/change')
  async changePassword(
    @Req() req: RequestWithUser,
    @Body() body: ChangePasswordDto,
  ) {
    const result = await this.authService.changePassword(req.user!.userId, body);
    return { access_token: result.access_token, user: result.user };
  }

  @Post('password/forgot/request')
  async forgotPasswordRequest(@Body() body: ForgotPasswordRequestDto) {
    return this.authService.forgotPasswordRequest(body.phone);
  }

  @Post('password/forgot/verify')
  async forgotPasswordVerify(@Body() body: ForgotPasswordVerifyDto) {
    return this.authService.forgotPasswordVerify(body.phone, body.code);
  }

  @Post('password/forgot/reset')
  async forgotPasswordReset(@Body() body: ForgotPasswordResetDto) {
    return this.authService.forgotPasswordReset(
      body.resetToken,
      body.newPassword,
    );
  }

  /** New access token using HTTP-only `refresh_token` cookie. */
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('No refresh token');
    }
    const result = await this.authService.refreshWithRefreshToken(token);
    res.cookie(
      REFRESH_TOKEN_COOKIE,
      result.refresh_token,
      this.authService.getRefreshCookieOptions(),
    );
    res.cookie(
      ROLE_COOKIE,
      result.user.role,
      this.authService.getRoleCookieOptions(),
    );
    return { access_token: result.access_token, user: result.user };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(REFRESH_TOKEN_COOKIE, {
      ...this.authService.getClearRefreshCookieOptions(),
    });
    res.clearCookie(ROLE_COOKIE, {
      ...this.authService.getClearRoleCookieOptions(),
    });
    return { message: 'Logged out' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: RequestWithUser) {
    return this.authService.getMe(req.user!.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateMe(
    @Req() req: RequestWithUser,
    @Body() body: UpdateMeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.updateMe(req.user!.userId, body);
    return { access_token: result.access_token, user: result.user };
  }

  @UseGuards(JwtAuthGuard)
  @Post('email-otp/request')
  async requestEmailOtp(
    @Req() req: RequestWithUser,
    @Body() body: { email?: string },
  ) {
    return this.authService.requestEmailOtp(
      req.user!.userId,
      body.email ?? '',
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('email-otp/verify')
  async verifyEmailOtp(
    @Req() req: RequestWithUser,
    @Body() body: { email?: string; code?: string },
  ) {
    const result = await this.authService.verifyEmailOtp(
      req.user!.userId,
      body.email ?? '',
      body.code ?? '',
    );
    return { access_token: result.access_token, user: result.user };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me')
  async deleteMe(
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.deleteMe(req.user!.userId);
 
    return { message: 'Account deleted successfully' };
  }

  /**
   * Admin-only endpoint to impersonate another user.
   * Returns fresh tokens for the target user (cookies updated).
   */
  @UseGuards(JwtAuthGuard)
  @Post('admin/login-as')
  async adminLoginAs(
    @Body() body: AdminLoginAsDto,
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (req.user?.role !== 'admin') {
      throw new UnauthorizedException('Only admins can impersonate users');
    }
    const result = await this.authService.adminLoginAs(body.userId);
    res.cookie(
      REFRESH_TOKEN_COOKIE,
      result.refresh_token,
      this.authService.getRefreshCookieOptions(),
    );
    res.cookie(
      ROLE_COOKIE,
      result.user.role,
      this.authService.getRoleCookieOptions(),
    );
    return {
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      user: result.user,
    };
  }
}
