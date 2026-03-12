import { Module } from '@nestjs/common';
import { UploadsService } from './uploads.service';
import { UploadsController } from './uploads.controller';
import { AppwriteProvider } from './appwrite.provider';

@Module({
    controllers: [UploadsController],
    providers: [UploadsService, AppwriteProvider],
    exports: [UploadsService, AppwriteProvider],
})
export class UploadsModule { }
