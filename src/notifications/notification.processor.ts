import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { AsyncQueueName } from '../infrastructure/async-queues/async-queues.constants.js';
import { NotificationsService } from './notifications.service.js';

interface NotificationJob {
  notificationId: string;
}

@Processor(AsyncQueueName.Notifications)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(private readonly notifications: NotificationsService) {
    super();
  }

  async process(job: Job<NotificationJob>): Promise<void> {
    if (job.name !== 'deliver-notification' || !job.data.notificationId) {
      throw new TypeError('Notification queue payload is invalid');
    }
    await this.notifications.process(job.data.notificationId);
  }

  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<NotificationJob> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job?.data.notificationId) {
      return;
    }
    const terminal = job.attemptsMade >= (job.opts.attempts ?? 1);
    await this.notifications.recordFailure({
      notificationId: job.data.notificationId,
      reason: error.name || 'NotificationProcessingError',
      terminal,
    });
    this.logger.error(
      JSON.stringify({
        notificationId: job.data.notificationId,
        attemptsMade: job.attemptsMade,
        terminal,
      }),
    );
  }
}
