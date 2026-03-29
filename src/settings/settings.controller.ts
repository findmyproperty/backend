import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

interface RequestWithUser extends Request {
  user?: {
    userId: number;
    role: string;
  };
}

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async getSettings() {
    return await this.settingsService.getSettings();
  }

  @UseGuards(JwtAuthGuard)
  @Patch()
  async update(
    @Body() updateSettingDto: UpdateSettingDto,
    @Req() req: RequestWithUser,
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins can update system settings');
    }
    return await this.settingsService.update(updateSettingDto);
  }
}
