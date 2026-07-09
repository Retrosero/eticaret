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
  ],
  exports: ['NOTIFICATION_SERVICE'],
})
export class NotificationModule {}