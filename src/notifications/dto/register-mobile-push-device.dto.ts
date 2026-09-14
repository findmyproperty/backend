import { IsIn, IsString, Matches, MaxLength } from 'class-validator';
import type { MobilePlatform } from '../entities/mobile-push-device.entity';

export class RegisterMobilePushDeviceDto {
  @IsString()
  @MaxLength(255)
  @Matches(/^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/, {
    message: 'token must be a valid Expo push token',
  })
  token: string;

  @IsIn(['ios', 'android'])
  platform: MobilePlatform;
}

export class UnregisterMobilePushDeviceDto {
  @IsString()
  @MaxLength(255)
  token: string;
}
