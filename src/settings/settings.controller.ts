import {
  Controller,
  Get,
  Header,
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
  // Branding rarely changes; let Next's data cache + any CDN reuse the row
  // for 10 minutes. Admin saves trigger `revalidateTag('settings')` on the
  // frontend so a stale value is never user-visible for long.
  @Header('Cache-Control', 'public, max-age=0, s-maxage=600')
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
