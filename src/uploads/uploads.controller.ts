import {
    Controller,
    Post,
    UploadedFile,
    UploadedFiles,
    UseInterceptors,
    BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { UploadsService } from './uploads.service';

@Controller('uploads')
export class UploadsController {
    constructor(private readonly uploadsService: UploadsService) { }

    @Post('image')
    @UseInterceptors(FileInterceptor('file'))
    async uploadImage(@UploadedFile() file: Express.Multer.File) {
        try {
            const result = await this.uploadsService.uploadFile(file);
            return {
                url: this.uploadsService.getFileView(result.$id),
                fileId: result.$id,
            };
        } catch (error) {
            throw new BadRequestException('Upload failed: ' + error.message);
        }
    }

    @Post('images')
    @UseInterceptors(FilesInterceptor('files'))
    async uploadImages(@UploadedFiles() files: Express.Multer.File[]) {
        try {
            const results = await this.uploadsService.uploadMultiple(files);
            return results.map((result) => ({
                url: this.uploadsService.getFileView(result.$id),
                fileId: result.$id,
            }));
        } catch (error) {
            throw new BadRequestException('Multiple upload failed: ' + error.message);
        }
    }
}
