import {
  BadRequestException,
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import sharp from 'sharp';
import * as fs from 'fs';
import {
  ensureUploadDirExists,
  getPublicUploadBaseUrl,
  getUploadDestination,
  UPLOAD_PUBLIC_PATH,
} from './upload-paths';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// Ensure the upload directory exists at module load time
const uploadDest = ensureUploadDirExists();

@Controller('upload')
export class UploadController {
  @UseGuards(JwtAuthGuard)
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: uploadDest,
        filename: (req, file, cb) => {
          const uniqueName = Date.now() + '-' + file.originalname;
          cb(null, uniqueName);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_req, file, callback) => {
        const allowed = [
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/heic',
          'video/mp4',
          'video/quicktime',
          'application/pdf',
        ];
        callback(
          allowed.includes(file.mimetype)
            ? null
            : new BadRequestException('Unsupported upload type'),
          allowed.includes(file.mimetype),
        );
      },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('A file is required');
    if (file.mimetype.startsWith('image/')) {
      const buffer = fs.readFileSync(file.path);
      const compressedBuffer = await sharp(buffer)
        .resize({ width: 1200, withoutEnlargement: true })
        .toBuffer();
      fs.writeFileSync(file.path, compressedBuffer);
    }

    const baseUrl = getPublicUploadBaseUrl();
    return {
      url: `${baseUrl}/${UPLOAD_PUBLIC_PATH}/${file.filename}`,
    };
  }
}
