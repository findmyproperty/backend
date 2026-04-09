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
    return this.authService.requestPhoneOtp(body.phone);
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
  @Delete('me')
  async deleteMe(
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.deleteMe(req.user!.userId);
 
    return { message: 'Account deleted successfully' };
  }
}
