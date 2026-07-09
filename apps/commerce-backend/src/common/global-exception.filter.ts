/**
 * Global exception filter — standart JSON hata yanıtı.
 *
 * @example
 * ```json
 * { "success": false, "error": { "code":"VALIDATION_ERROR", "message":"..." } }
 * ```
 */

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Inject,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiError } from '@eticart/config';
import type { Logger } from '@eticart/config';

import { LOGGER_TOKEN } from './logger.js';

const isDev = (): boolean => process.env['NODE_ENV'] === 'development';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(@Inject(LOGGER_TOKEN) private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const correlationId =
      (host.switchToHttp().getRequest<{ correlationId?: string }>()
        .correlationId as string | undefined) ?? null;

    let statusCode = 500;
    let body: {
      success: false;
      error: { code: string; message: string; details?: unknown; stack?: string };
    };

    if (exception instanceof ApiError) {
      statusCode = exception.statusCode;
      body = { success: false, error: exception.toJSON(isDev()) };
    } else if (exception instanceof HttpException) {
      const r = exception.getResponse();
      const message =
        typeof r === 'string'
          ? r
          : ((r as { message?: string | string[] }).message ?? exception.message);
      const code =
        (typeof r === 'object' && r && 'error' in r && (r as { error?: string }).error) ||
        'HTTP_ERROR';
      statusCode = exception.getStatus();
      body = {
        success: false,
        error: {
          code,
          message: Array.isArray(message) ? message.join('; ') : message,
          ...(isDev() && exception.stack ? { stack: exception.stack } : {}),
        },
      };
    } else if (exception instanceof Error) {
      this.logger.error(
        { correlationId, err: { message: exception.message, stack: exception.stack } },
        'Beklenmeyen hata',
      );
      body = {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: exception.message || 'Beklenmeyen bir hata oluştu.',
          ...(isDev() && exception.stack ? { stack: exception.stack } : {}),
        },
      };
    } else {
      this.logger.error({ correlationId }, 'Bilinmeyen hata türü');
      body = {
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Bilinmeyen hata.' },
      };
    }

    res.status(statusCode).json({
      ...body,
      correlationId,
    });
  }
}
