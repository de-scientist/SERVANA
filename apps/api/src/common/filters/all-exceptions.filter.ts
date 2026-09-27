import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { AppLoggerService } from '../logging/logger.service';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new AppLoggerService('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred.';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        message = (r.message as string) ?? exception.message;
        code = (r.error as string) ?? `HTTP_${status}`;
        details = r.details ?? r;
      }
    } else if (exception instanceof Error) {
      // Never leak internals (Prisma query fragments, stack traces, paths).
      // Details go to server logs only. Hand-rolled 4xx errors (err.status)
      // keep their status and message; everything else becomes generic.
      this.logger.error(exception.message, exception.stack);
      const maybe = exception as { status?: unknown; statusCode?: unknown };
      const hint =
        typeof maybe.status === 'number'
          ? maybe.status
          : typeof maybe.statusCode === 'number'
            ? maybe.statusCode
            : HttpStatus.INTERNAL_SERVER_ERROR;
      if (hint >= 400 && hint < 500) {
        status = hint;
        code = `HTTP_${hint}`;
        message = exception.message;
      } else {
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        code = 'INTERNAL_ERROR';
        message = 'An unexpected error occurred.';
        details = undefined;
      }
    }

    const body: ErrorBody = { error: { code, message, details } };
    response.status(status).json(body);
  }
}
