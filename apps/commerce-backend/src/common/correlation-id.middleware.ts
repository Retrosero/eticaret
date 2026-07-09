/**
 * Korelasyon kimliği middleware'i.
 *
 * İstek başına `correlationId` üretir; logger ve yanıt başlığına ekler.
 */

import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming =
      (req.headers['x-correlation-id'] as string | undefined) ??
      (req.headers['x-request-id'] as string | undefined);
    const id = incoming && /^[A-Za-z0-9._-]{1,128}$/.test(incoming) ? incoming : randomUUID();
    (req as unknown as { correlationId: string }).correlationId = id;
    res.setHeader('X-Correlation-Id', id);
    next();
  }
}
