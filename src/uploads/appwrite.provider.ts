import { Client, Storage } from 'node-appwrite';
import { ConfigService } from '@nestjs/config';

export const APPWRITE_STORAGE = 'AppwriteStorage';

export const AppwriteProvider = {
  provide: APPWRITE_STORAGE,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const client = new Client()
      .setEndpoint(configService.get<string>('APPWRITE_ENDPOINT') || 'https://cloud.appwrite.io/v1')
      .setProject(configService.get<string>('APPWRITE_PROJECT_ID') || '')
      .setKey(configService.get<string>('APPWRITE_API_KEY') || '');

    return new Storage(client);
  },
};
