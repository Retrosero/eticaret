/**
 * GlobalExceptionFilter — tüm throw'ları standart API yanıtına çevirir.
 *
 * Üretimde stack trace gizlenir; geliştirmede `ApiError.toJSON(true)`
 * ile birlikte döner.
 */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger as NestLogger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError, fail, type Logger as PinoLogger } from '@eticart/config';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly nestLogger = new NestLogger(GlobalExceptionFilter.name);

  constructor(private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const requestId =
      (req as Request & { requestId?: string }).requestId ?? null;
    const correlationId =
      (req as Request & { correlationId?: string }).correlationId ?? null;

    const { status, body } = this.toErrorBody(exception);

    this.logger.error(
      {
        status,
        code: body.error.code,
        message: body.error.message,
        path: req.url,
        method: req.method,
        requestId,
        correlationId,
        err: exception instanceof Error ? { name: exception.name, message: exception.message } : exception,
      },
      'İstek hata ile sonuçlandı',
    );

    res.status(status).json(body);
  }

  private toErrorBody(exception: unknown): {
    status: number;
    body: ReturnType<typeof fail>;
  } {
    if (exception instanceof ApiError) {
      return { status: exception.statusCode, body: fail(exception.code, exception.message, exception.details) };
    }
    if (exception instanceof ZodError) {
      const flat = exception.flatten();
      return {
        status: HttpStatus.BAD_REQUEST,
        body: fail('VALIDATION_ERROR', 'İstek gövdesi doğrulaması başarısız.', {
          fieldErrors: flat.fieldErrors,
          formErrors: flat.formErrors,
        }),
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const message =
        typeof raw === 'string'
          ? raw
          : (raw as { message?: string }).message ?? 'Bilinmeyen HTTP hatası.';
      return {
        status,
        body: fail('HTTP_ERROR', Array.isArray(message) ? message.join('; ') : String(message)),
      };
    }
    const err = exception instanceof Error ? exception : new Error('Bilinmeyen hata.');
    this.nestLogger.error(err);
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: fail('INTERNAL_SERVER_ERROR', 'Beklenmeyen bir sunucu hatası oluştu.'),
    };
  }
}
