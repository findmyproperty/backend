import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { UpdateMeDto } from './dto/update-me.dto';
import { RequestPhoneOtpDto } from './dto/request-phone-otp.dto';
import { VerifyPhoneOtpDto } from './dto/verify-phone-otp.dto';

import { Request } from 'express';

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
  async verifyPhoneOtp(@Body() body: VerifyPhoneOtpDto) {
    return this.authService.verifyPhoneOtp(body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: RequestWithUser) {
    return this.authService.getMe(req.user!.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateMe(@Req() req: RequestWithUser, @Body() body: UpdateMeDto) {
    return this.authService.updateMe(req.user!.userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me')
  async deleteMe(@Req() req: RequestWithUser) {
    return this.authService.deleteMe(req.user!.userId);
  }
}
