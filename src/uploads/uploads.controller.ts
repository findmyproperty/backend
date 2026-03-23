import {
    Controller,
    Post,
    UseInterceptors,
    UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';

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
    uploadFile(@UploadedFile() file: Express.Multer.File) {
        return {
            url: `http://187.127.133.141/uploads/${file.filename}`,
        };
    }
}
