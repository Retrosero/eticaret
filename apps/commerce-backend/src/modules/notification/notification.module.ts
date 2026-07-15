/**
 * Notification modülü.
 * Order, dealer, KVKK servisleri tarafından inject edilir.
 */
import { Module, Global } from '@nestjs/common';
import { NotificationService } from './notification-service.js';

@Global()
@Module({
  providers: [
    {
      provide: 'NOTIFICATION_SERVICE',
      useValue: NotificationService,
    },
    {
      provide: 'EMAIL_QUEUE_TOKEN',
      useValue: NotificationService.queue,
    },
  ],
  exports: ['NOTIFICATION_SERVICE', 'EMAIL_QUEUE_TOKEN'],
})
export class NotificationModule {}
