import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from './entities/setting.entity';
import { UpdateSettingDto } from './dto/update-setting.dto';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Setting)
    private readonly settingsRepository: Repository<Setting>,
  ) {}

  async getSettings(): Promise<Setting> {
    let settings = await this.settingsRepository.findOne({ where: { id: 1 } });

    if (!settings) {
      // Create default settings if they don't exist
      settings = this.settingsRepository.create({ id: 1 });
      settings = await this.settingsRepository.save(settings);
    }

    return settings;
  }

  async update(updateSettingDto: UpdateSettingDto): Promise<Setting> {
    const settings = await this.getSettings();
    const updated = Object.assign(settings, updateSettingDto);
    return await this.settingsRepository.save(updated);
  }
}
