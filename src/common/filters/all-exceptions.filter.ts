import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { SystemLogsService } from '../../system-logs/system-logs.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logsService: SystemLogsService) {}

  async catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<
      Request<object, unknown> & { user: { userId: number } }
    >();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? (exception.getResponse() as { message: string }).message ||
          exception.message
        : 'Internal server error';

    const userId = request.user?.userId;

    // Log the error to database
    await this.logsService.error(
      `Exception: ${message}`,
      exception.stack,
      {
        body: request.body as unknown,
        query: request.query as unknown,
        params: request.params as unknown,
        statusCode: status,
        url: request.url,
        method: request.method,
        ip: request.ip,
        userId,
      },
      'AllExceptionsFilter',
    );

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: message,
    });
  }
}
