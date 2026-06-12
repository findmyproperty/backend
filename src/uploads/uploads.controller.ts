import {
  Controller,
  Post,
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

// Ensure the upload directory exists at module load time
const uploadDest = ensureUploadDirExists();

@Controller('upload')
export class UploadController {
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
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
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
