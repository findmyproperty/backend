import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

@SkipThrottle()
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
