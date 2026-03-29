import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { SystemLogsService } from '../../system-logs/system-logs.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logsService: SystemLogsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, ip } = request;
    const userId = request.user?.userId;
    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        // Only log non-GET requests to the database
        if (method !== 'GET') {
          const duration = Date.now() - now;
          this.logsService.log({
            level: 'info',
            message: `Request completed: ${method} ${url} - ${duration}ms`,
            method,
            url,
            userId,
            ip,
            source: context.getClass().name,
            context: {
              duration: `${duration}ms`,
              handler: context.getHandler().name,
            },
          });
        }
      }),
    );
  }
}
