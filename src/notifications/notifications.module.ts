import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AsyncQueuesModule } from '../infrastructure/async-queues/async-queues.module.js';
import { OutboxModule } from '../infrastructure/outbox/outbox.module.js';
import { NotificationEntity } from './notification.entity.js';
import { NotificationPreferenceEntity } from './notification-preference.entity.js';
import { NotificationProcessor } from './notification.processor.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationEntity,
      NotificationPreferenceEntity,
    ]),
    AsyncQueuesModule,
    OutboxModule,
  ],
  providers: [NotificationsService, NotificationProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule {}
