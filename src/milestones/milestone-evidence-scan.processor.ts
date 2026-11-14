import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { AsyncQueueName } from '../infrastructure/async-queues/async-queues.constants.js';
import { ObjectStorageService } from '../infrastructure/object-storage/object-storage.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AwardEntity } from '../publications/award.entity.js';
import { ClamAvScannerService } from '../verification/clamav-scanner.service.js';
import { EvidenceAssetEntity, EvidenceSubmissionEntity, MilestoneEntity } from './milestone.entity.js';

interface MilestoneEvidenceScanJob {
  assetId: string;
  submissionId: string;
}

@Processor(AsyncQueueName.MilestoneEvidenceScans, { concurrency: 2 })
export class MilestoneEvidenceScanProcessor extends WorkerHost {
  private readonly logger = new Logger(MilestoneEvidenceScanProcessor.name);

  constructor(
    @InjectRepository(EvidenceAssetEntity)
    private readonly assets: Repository<EvidenceAssetEntity>,
    private readonly dataSource: DataSource,
    private readonly storage: ObjectStorageService,
    private readonly scanner: ClamAvScannerService,
    private readonly notifications: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<MilestoneEvidenceScanJob>): Promise<void> {
    if (
      job.name !== 'scan-milestone-evidence-asset' ||
      !job.data.assetId ||
      !job.data.submissionId
    ) {
      throw new TypeError('Milestone evidence scan payload is invalid');
    }
    const asset = await this.assets.findOneBy({
      id: job.data.assetId,
      evidenceSubmissionId: job.data.submissionId,
    });
    if (!asset) throw new Error('Milestone evidence asset was not found');
    if (asset.scanStatus === 'Passed' || asset.scanStatus === 'Quarantined') return;
    const submission = await this.dataSource.getRepository(EvidenceSubmissionEntity).findOneBy({
      id: asset.evidenceSubmissionId,
    });
    if (!submission) throw new Error('Milestone evidence submission was not found');
    if (submission.status === 'Quarantined') return;

    await this.dataSource.getRepository(EvidenceSubmissionEntity).update(
      { id: asset.evidenceSubmissionId, status: 'PendingUpload' },
      { status: 'Scanning' },
    );
    const milestone = await this.dataSource.getRepository(MilestoneEntity).findOneBy({
      id: submission.milestoneId,
    });
    if (!milestone) throw new Error('Milestone for evidence asset was not found');
    const award = await this.dataSource.getRepository(AwardEntity).findOneBy({ id: milestone.awardId });
    if (!award) throw new Error('Milestone Award was not found');
    const scope = `milestones/${award.id}/${milestone.id}/${submission.id}`;
    const stream = await this.storage.getObjectStream(asset.storageKey, scope);
    const result = await this.scanner.scan(stream, Number(asset.sizeBytes));
    const status = result === 'clean' ? 'Passed' : 'Quarantined';
    await this.assets.update({ id: asset.id, scanStatus: 'Pending' }, { scanStatus: status });
    if (result === 'infected') {
      await this.quarantineSubmission(submission, 'infected');
      return;
    }
    await this.markSubmissionReady(submission.id);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<MilestoneEvidenceScanJob> | undefined, error: Error): Promise<void> {
    const assetId = job?.data.assetId;
    const submissionId = job?.data.submissionId;
    if (!assetId || !submissionId) return;
    const terminal = job.attemptsMade >= (job.opts.attempts ?? 1);
    if (!terminal) return;
    const asset = await this.assets.findOneBy({ id: assetId, evidenceSubmissionId: submissionId });
    if (!asset || asset.scanStatus !== 'Pending') return;
    await this.assets.update({ id: asset.id, scanStatus: 'Pending' }, { scanStatus: 'Quarantined' });
    const submission = await this.dataSource.getRepository(EvidenceSubmissionEntity).findOneBy({ id: submissionId });
    if (submission) await this.quarantineSubmission(submission, 'failed');
    this.logger.warn(JSON.stringify({ assetId, submissionId, event: 'evidence-scan-quarantined', reason: error.name }));
  }

  private async markSubmissionReady(submissionId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const submission = await manager.getRepository(EvidenceSubmissionEntity).findOne({
        where: { id: submissionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!submission || submission.status === 'Submitted' || submission.status === 'Quarantined') return;
      const assets = await manager.getRepository(EvidenceAssetEntity).find({
        where: { evidenceSubmissionId: submission.id },
      });
      if (!assets.length || assets.some((asset) => asset.scanStatus !== 'Passed')) return;
      submission.status = 'Submitted';
      await manager.save(submission);
      const milestone = await manager.getRepository(MilestoneEntity).findOne({
        where: { id: submission.milestoneId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!milestone) throw new Error('Milestone was not found');
      const nextStatus = milestone.status === 'Ready'
        ? 'Submitted'
        : milestone.status === 'ChangesRequested'
          ? 'Resubmitted'
          : undefined;
      if (nextStatus) {
        await manager.query(
          'UPDATE "milestones" SET "status" = $2, "stateVersion" = "stateVersion" + 1, "updatedAt" = NOW() WHERE "id" = $1',
          [milestone.id, nextStatus],
        );
      }
    });
  }

  private async quarantineSubmission(
    submission: EvidenceSubmissionEntity,
    outcome: 'infected' | 'failed',
  ): Promise<void> {
    await this.dataSource.getRepository(EvidenceSubmissionEntity).update(
      { id: submission.id, status: 'Scanning' },
      { status: 'Quarantined' },
    );
    try {
      await this.notifications.create({
        userId: submission.submittedByUserId,
        idempotencyKey: `milestone-evidence-${submission.id}-${outcome}`,
        category: 'milestone_evidence',
        title: outcome === 'infected' ? 'Milestone evidence quarantined' : 'Milestone evidence scan failed',
        body: outcome === 'infected'
          ? 'An evidence file did not pass the malware scan. Upload a clean replacement before requesting review.'
          : 'An evidence file could not be scanned after bounded retries and remains private in quarantine.',
        data: { milestoneId: submission.milestoneId, submissionId: submission.id },
        correlationId: submission.id,
      });
    } catch (notificationError) {
      this.logger.error(
        JSON.stringify({ submissionId: submission.id, event: 'evidence-scan-notification-failed' }),
        notificationError instanceof Error ? notificationError.stack : undefined,
      );
    }
  }
}
