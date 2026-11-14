import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AsyncQueueName } from '../infrastructure/async-queues/async-queues.constants.js';
import { AsyncQueuesService } from '../infrastructure/async-queues/async-queues.service.js';
import { ApplicationAttachmentEntity } from './application-attachment.entity.js';

@Injectable()
export class ApplicationAttachmentScanScheduler {
  private readonly logger = new Logger(ApplicationAttachmentScanScheduler.name);
  constructor(@InjectRepository(ApplicationAttachmentEntity) private readonly attachments: Repository<ApplicationAttachmentEntity>, private readonly queues: AsyncQueuesService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async schedulePending(): Promise<void> {
    const attachments = await this.attachments.find({ where: { status: 'Uploaded' }, order: { createdAt: 'ASC', id: 'ASC' }, take: 100 });
    for (const attachment of attachments) {
      try {
        await this.queues.enqueue(AsyncQueueName.ApplicationAttachmentScans, 'scan-application-attachment', { attachmentId: attachment.id }, { jobId: `application-attachment-${attachment.id}` });
      } catch {
        this.logger.warn('Application attachment scan queue is unavailable');
        break;
      }
    }
  }
}
