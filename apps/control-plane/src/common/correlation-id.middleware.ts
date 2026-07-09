/**
 * CorrelationIdMiddleware — her isteğe benzersiz requestId + correlationId atar.
 * Yanıt başlıklarına yansıtır, log context'ini zenginleştirir.
 */

import {
  Injectable,
  NestMiddleware,
  type NestMiddleware as INestMiddleware,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
  pickOrCreateRequestId,
  writeCorrelationHeaders,
} from '@eticart/config';

@Injectable()
export class CorrelationIdMiddleware implements INestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const ids = pickOrCreateRequestId(req.headers);
    writeCorrelationHeaders(res, ids);

    // İsteğe ekle — controller/middleware'lerden erişilebilir
    (req as Request & { requestId?: string; correlationId?: string }).requestId =
      ids.requestId;
    (req as Request & { requestId?: string; correlationId?: string }).correlationId =
      ids.correlationId;

    next();
  }
}
