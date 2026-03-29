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

@Controller('upload')
export class UploadController {
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: '/var/www/uploads',
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
        .resize({ width: 1200, withoutEnlargement: true }) // Adjust max width as needed
        .toBuffer();
      fs.writeFileSync(file.path, compressedBuffer);
    }

    return {
      url: `http://187.127.133.141/uploads/${file.filename}`,
    };
  }
}
