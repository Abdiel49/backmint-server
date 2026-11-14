import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { malwareScanConfig } from '../config/configuration.js';
import { AsyncQueueName } from '../infrastructure/async-queues/async-queues.constants.js';
import { AsyncQueuesService } from '../infrastructure/async-queues/async-queues.service.js';
import { ObjectStorageService } from '../infrastructure/object-storage/object-storage.service.js';
import { AwardEntity } from '../publications/award.entity.js';
import {
  EvidenceAssetEntity,
  EvidenceSubmissionEntity,
  MilestoneEntity,
  MilestoneTermsVersionEntity,
} from './milestone.entity.js';

export interface MilestoneEvidenceAssetInput {
  checksumSha256: string;
  mimeType: string;
  sizeBytes: number;
}

@Injectable()
export class MilestoneEvidenceService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: ObjectStorageService,
    private readonly queues: AsyncQueuesService,
    @Inject(malwareScanConfig.KEY)
    private readonly scanConfig: ConfigType<typeof malwareScanConfig>,
  ) {}

  async createUpload(input: {
    actorUserId: string;
    milestoneId: string;
    assets: MilestoneEvidenceAssetInput[];
  }) {
    if (!input.assets.length || input.assets.length > 10) {
      throw new BadRequestException('Evidence must contain 1 to 10 assets');
    }
    for (const asset of input.assets) {
      if (asset.sizeBytes > this.scanConfig.maxBytes) {
        throw new BadRequestException('Evidence asset exceeds the configured scan size limit');
      }
      if (!/^[a-f0-9]{64}$/.test(asset.checksumSha256)) {
        throw new BadRequestException('Evidence checksum must be a lowercase SHA-256 digest');
      }
    }

    return this.dataSource.transaction(async (manager) => {
      const milestone = await manager.getRepository(MilestoneEntity).findOne({
        where: { id: input.milestoneId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!milestone) throw new NotFoundException('Milestone was not found');
      const award = await manager.getRepository(AwardEntity).findOne({
        where: { id: milestone.awardId },
      });
      if (!award) throw new NotFoundException('Milestone Award was not found');
      await this.assertRecipient(manager, award, input.actorUserId);
      if (!['Ready', 'ChangesRequested'].includes(milestone.status)) {
        throw new ConflictException('Milestone is not accepting evidence');
      }
      const latest = await manager.getRepository(EvidenceSubmissionEntity).findOne({
        where: { milestoneId: milestone.id },
        order: { version: 'DESC' },
      });
      if (latest && ['PendingUpload', 'Scanning'].includes(latest.status)) {
        throw new ConflictException('The current evidence upload must finish before a replacement is created');
      }
      const version = (latest?.version ?? 0) + 1;
      const submissionRepository = manager.getRepository(EvidenceSubmissionEntity);
      const submission = await submissionRepository.save(
        submissionRepository.create({
          milestoneId: milestone.id,
          version,
          submittedByUserId: input.actorUserId,
          status: 'PendingUpload',
        }),
      );
      const scope = `milestones/${award.id}/${milestone.id}/${submission.id}`;
      const assetRepository = manager.getRepository(EvidenceAssetEntity);
      const uploadAssets = [];
      for (const asset of input.assets) {
        const checksumBase64 = Buffer.from(asset.checksumSha256, 'hex').toString('base64');
        const signed = await this.storage.createUploadUrl({
          scope,
          contentType: asset.mimeType,
          contentLength: asset.sizeBytes,
          checksumSha256: checksumBase64,
        });
        const savedAsset = await assetRepository.save(
          assetRepository.create({
            evidenceSubmissionId: submission.id,
            storageKey: signed.key,
            checksumSha256: asset.checksumSha256,
            mimeType: asset.mimeType,
            sizeBytes: String(asset.sizeBytes),
            visibility: 'Private',
            scanStatus: 'Pending',
          }),
        );
        uploadAssets.push({
          assetId: savedAsset.id,
          uploadUrl: signed.url,
          expiresAt: signed.expiresAt,
          requiredHeaders: {
            'content-type': asset.mimeType,
            'x-amz-checksum-sha256': checksumBase64,
          },
        });
      }
      return {
        milestoneId: milestone.id,
        submissionId: submission.id,
        version,
        status: submission.status,
        uploadAssets,
      };
    });
  }

  async completeUpload(input: {
    actorUserId: string;
    milestoneId: string;
    submissionId: string;
  }) {
    const data = await this.dataSource.transaction(async (manager) => {
      const submission = await manager.getRepository(EvidenceSubmissionEntity).findOne({
        where: { id: input.submissionId, milestoneId: input.milestoneId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!submission) throw new NotFoundException('Evidence submission was not found');
      const milestone = await manager.getRepository(MilestoneEntity).findOneBy({ id: input.milestoneId });
      if (!milestone) throw new NotFoundException('Milestone was not found');
      const award = await manager.getRepository(AwardEntity).findOneBy({ id: milestone.awardId });
      if (!award) throw new NotFoundException('Milestone Award was not found');
      await this.assertRecipient(manager, award, input.actorUserId);
      if (submission.status === 'Submitted') {
        return { submission, assets: [], alreadyComplete: true };
      }
      if (submission.status === 'Quarantined') {
        throw new ConflictException('Quarantined evidence cannot be submitted for review');
      }
      const assets = await manager.getRepository(EvidenceAssetEntity).find({
        where: { evidenceSubmissionId: submission.id },
        order: { id: 'ASC' },
      });
      if (!assets.length) throw new ConflictException('Evidence submission has no assets');
      const scope = `milestones/${award.id}/${milestone.id}/${submission.id}`;
      for (const asset of assets) {
        if (asset.scanStatus !== 'Pending') continue;
        let stored;
        try {
          stored = await this.storage.headObject(asset.storageKey, scope);
        } catch (error) {
          const statusCode = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
          if (statusCode === 404 || (error as { name?: string }).name === 'NotFound') {
            throw new ConflictException('An uploaded evidence object could not be found');
          }
          throw new ServiceUnavailableException('Private object storage is unavailable for upload verification');
        }
        const expectedBase64 = Buffer.from(asset.checksumSha256, 'hex').toString('base64');
        if (
          stored.contentLength !== Number(asset.sizeBytes) ||
          stored.checksumSha256 !== expectedBase64 ||
          stored.metadataChecksumSha256 !== expectedBase64
        ) {
          throw new ConflictException('Uploaded evidence does not match its declared size and SHA-256 checksum');
        }
      }
      if (submission.status === 'PendingUpload') {
        submission.status = 'Scanning';
        await manager.save(submission);
      }
      return { submission, assets: assets.filter((asset) => asset.scanStatus === 'Pending'), alreadyComplete: false };
    });
    if (data.alreadyComplete) {
      return { submissionId: data.submission.id, version: data.submission.version, status: 'Submitted' };
    }
    try {
      await Promise.all(data.assets.map((asset) => this.queues.enqueue(
        AsyncQueueName.MilestoneEvidenceScans,
        'scan-milestone-evidence-asset',
        { assetId: asset.id, submissionId: data.submission.id },
        { jobId: `milestone-evidence-${asset.id}` },
      )));
    } catch {
      throw new ServiceUnavailableException('Evidence malware scan could not be queued; retry upload completion');
    }
    return { submissionId: data.submission.id, version: data.submission.version, status: 'Scanning' };
  }

  async createDownloadUrl(input: {
    actorUserId: string;
    milestoneId: string;
    submissionId: string;
    assetId: string;
  }) {
    const submission = await this.dataSource.getRepository(EvidenceSubmissionEntity).findOne({
      where: { id: input.submissionId, milestoneId: input.milestoneId },
    });
    if (!submission) throw new NotFoundException('Evidence submission was not found');
    if (submission.status !== 'Submitted') {
      throw new ConflictException('Evidence is unavailable until every asset passes malware scanning');
    }
    const milestone = await this.dataSource.getRepository(MilestoneEntity).findOneBy({ id: input.milestoneId });
    if (!milestone) throw new NotFoundException('Milestone was not found');
    const award = await this.dataSource.getRepository(AwardEntity).findOneBy({ id: milestone.awardId });
    if (!award) throw new NotFoundException('Milestone Award was not found');
    await this.assertEvidenceAccess(award, milestone, submission, input.actorUserId);
    const asset = await this.dataSource.getRepository(EvidenceAssetEntity).findOneBy({
      id: input.assetId,
      evidenceSubmissionId: submission.id,
    });
    if (!asset) throw new NotFoundException('Evidence asset was not found');
    if (asset.scanStatus !== 'Passed' || asset.visibility !== 'Private') {
      throw new ConflictException('Evidence is unavailable until every asset passes malware scanning');
    }
    const scope = `milestones/${award.id}/${milestone.id}/${submission.id}`;
    const signed = await this.storage.createDownloadUrl({ scope, key: asset.storageKey });
    return { assetId: asset.id, url: signed.url, expiresAt: signed.expiresAt };
  }

  private async assertRecipient(manager: import('typeorm').EntityManager, award: AwardEntity, actorUserId: string): Promise<void> {
    if (award.recipientUserId === actorUserId) return;
    if (!award.recipientOrganizationId) throw new ForbiddenException('Only the Award recipient may upload milestone evidence');
    const rows = await manager.query(
      'SELECT 1 FROM "organization_memberships" WHERE "organizationId" = $1 AND "userId" = $2 AND "status" = $3 AND "role" IN ($4, $5, $6, $7) LIMIT 1',
      [award.recipientOrganizationId, actorUserId, 'Active', 'Owner', 'Admin', 'ProjectManager', 'Representative'],
    );
    if (!rows.length) throw new ForbiddenException('Active Award recipient membership is required');
  }

  private async assertEvidenceAccess(
    award: AwardEntity,
    milestone: MilestoneEntity,
    submission: EvidenceSubmissionEntity,
    actorUserId: string,
  ): Promise<void> {
    if (submission.submittedByUserId === actorUserId || award.recipientUserId === actorUserId) return;
    if (award.recipientOrganizationId) {
      const membership = await this.dataSource.query(
        'SELECT 1 FROM "organization_memberships" WHERE "organizationId" = $1 AND "userId" = $2 AND "status" = $3 AND "role" IN ($4, $5, $6, $7) LIMIT 1',
        [award.recipientOrganizationId, actorUserId, 'Active', 'Owner', 'Admin', 'ProjectManager', 'Representative'],
      );
      if (membership.length) return;
    }
    const terms = await this.dataSource.getRepository(MilestoneTermsVersionEntity).findOne({
      where: { milestoneId: milestone.id, version: milestone.currentTermsVersion },
    });
    if ((terms?.reviewerUserId ?? milestone.reviewerUserId) === actorUserId) return;
    throw new ForbiddenException('Award recipient or assigned reviewer access is required');
  }
}
