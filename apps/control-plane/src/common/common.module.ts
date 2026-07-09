/**
 * CommonModule — merkezi hata filtreleri, korelasyon middleware,
 * request-scoped logger, email queue.
 */

import { Module, Global } from '@nestjs/common';
import { CorrelationIdMiddleware } from './correlation-id.middleware.js';
import { Logger } from './logger.js';
import { InMemoryQueue } from '@eticart/notification-adapters';
import type { EmailQueue } from '@eticart/notification-adapters';

export const EMAIL_QUEUE_TOKEN = 'EMAIL_QUEUE_TOKEN';

@Global()
@Module({
  providers: [
    CorrelationIdMiddleware,
    Logger,
    {
      provide: EMAIL_QUEUE_TOKEN,
      useFactory: (): EmailQueue => new InMemoryQueue(),
    },
  ],
  exports: [CorrelationIdMiddleware, Logger, EMAIL_QUEUE_TOKEN],
})
export class CommonModule {}