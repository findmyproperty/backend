import { Controller, Get } from '@nestjs/common';

@Controller('check-api')
export class CheckApiController {
  @Get()
  getStatus() {
    return {
      ok: true,
      message: 'API is running',
      timestamp: new Date().toISOString(),
    };
  }
}
