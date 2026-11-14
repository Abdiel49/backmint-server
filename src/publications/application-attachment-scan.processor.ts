import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import type { Job } from 'bullmq';
import { createHash } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { AsyncQueueName } from '../infrastructure/async-queues/async-queues.constants.js';
import { ObjectStorageService } from '../infrastructure/object-storage/object-storage.service.js';
import { ClamAvScannerService } from '../verification/clamav-scanner.service.js';
import { ApplicationAttachmentEntity } from './application-attachment.entity.js';
import { reconcileApplicationScans } from './application-scan-reconciliation.js';

interface ApplicationAttachmentScanJob { attachmentId: string }

@Processor(AsyncQueueName.ApplicationAttachmentScans, { concurrency: 2 })
export class ApplicationAttachmentScanProcessor extends WorkerHost {
  constructor(@InjectRepository(ApplicationAttachmentEntity) private readonly attachments: Repository<ApplicationAttachmentEntity>, private readonly storage: ObjectStorageService, private readonly scanner: ClamAvScannerService, private readonly dataSource: DataSource) { super(); }

  async process(job: Job<ApplicationAttachmentScanJob>): Promise<void> {
    if (job.name !== 'scan-application-attachment' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(job.data?.attachmentId ?? ''))
      throw new TypeError('Application attachment scan payload is invalid');
    const attachment = await this.attachments.findOneBy({ id: job.data.attachmentId });
    if (!attachment) throw new Error('Application attachment was not found');
    if (attachment.status !== 'Uploaded') return;
    const scope = `applications/uploads/${attachment.organizationId ?? attachment.uploadedByUserId}/${attachment.uploadedByUserId}`;
    const stream = await this.storage.getObjectStream(attachment.storageKey, scope);
    const hash = createHash('sha256');
    let exhausted = false;
    async function* verifyStream() {
      for await (const chunk of stream) {
        hash.update(chunk);
        yield chunk;
      }
      exhausted = true;
    }
    const result = await this.scanner.scan(verifyStream(), Number(attachment.sizeBytes));
    const clean = result === 'clean' && exhausted && hash.digest('hex') === attachment.checksumSha256;
    await this.recordResult(attachment.id, clean ? 'Clean' : 'Quarantined');
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ApplicationAttachmentScanJob> | undefined): Promise<void> {
    if (!job?.data?.attachmentId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(job.data.attachmentId) || job.attemptsMade < (job.opts.attempts ?? 1)) return;
    await this.recordResult(job.data.attachmentId, 'Quarantined');
  }

  private async recordResult(id: string, status: 'Clean' | 'Quarantined'): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ApplicationAttachmentEntity);
      const attachment = await repository.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!attachment || attachment.status !== 'Uploaded') return;
      await repository.update({ id, status: 'Uploaded' }, { status });
      if (attachment.applicationId) await reconcileApplicationScans(manager, attachment.applicationId);
    });
  }
}
