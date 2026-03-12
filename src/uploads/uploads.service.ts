import { Injectable, Inject } from '@nestjs/common';
import { Storage, ID, Models } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { APPWRITE_STORAGE } from './appwrite.provider';
import { AppwriteResponse } from './appwrite-response';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UploadsService {
  constructor(
    @Inject(APPWRITE_STORAGE) private readonly storage: Storage,
    private readonly configService: ConfigService,
  ) {}

  async uploadFile(file: Express.Multer.File): Promise<AppwriteResponse> {
    const bucketId = this.configService.get<string>('APPWRITE_BUCKET_ID') || '';
    return await this.storage.createFile(
      bucketId,
      ID.unique(),
      InputFile.fromBuffer(file.buffer, file.originalname),
    );
  }

  async uploadMultiple(
    files: Express.Multer.File[],
  ): Promise<AppwriteResponse[]> {
    const uploadPromises = files.map((file) => this.uploadFile(file));
    return Promise.all(uploadPromises);
  }

  getFileView(fileId: string): string {
    const endpoint = this.configService.get('APPWRITE_ENDPOINT');
    const projectId = this.configService.get('APPWRITE_PROJECT_ID');
    const bucketId = this.configService.get('APPWRITE_BUCKET_ID');
    return `${endpoint}/storage/buckets/${bucketId}/files/${fileId}/view?project=${projectId}`;
  }
}
