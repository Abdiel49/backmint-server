import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AuditPersistenceService } from '../audit/audit-persistence.service.js';
import {
  EvidenceAssetEntity,
  EvidenceSubmissionEntity,
  MilestoneEntity,
  MilestoneTermsVersionEntity,
} from './milestone.entity.js';
import { MilestoneReviewEntity } from './milestone-review.entity.js';

@Injectable()
export class MilestoneReviewsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditPersistenceService,
  ) {}

  async review(input: {
    milestoneId: string;
    actorUserId: string;
    evidenceVersion: number;
    verdict: 'Approved' | 'Rejected' | 'ChangesRequested';
    notes: string;
  }): Promise<MilestoneReviewEntity> {
    return this.dataSource.transaction(async (manager) => {
      const milestone = await manager.getRepository(MilestoneEntity).findOne({
        where: { id: input.milestoneId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!milestone) throw new NotFoundException('Milestone was not found');
      const currentTerms = await manager
        .getRepository(MilestoneTermsVersionEntity)
        .findOne({
          where: { milestoneId: milestone.id, version: milestone.currentTermsVersion },
        });
      if (!currentTerms) {
        throw new ConflictException('Milestone has no current terms version');
      }
      const assignedReviewer = currentTerms?.reviewerUserId ?? milestone.reviewerUserId;
      if (!assignedReviewer || assignedReviewer !== input.actorUserId) {
        throw new ForbiddenException('Only the assigned milestone reviewer may decide');
      }
      if (!['Submitted', 'Resubmitted'].includes(milestone.status)) {
        throw new ConflictException('Milestone is not awaiting an evidence review');
      }
      const submission = await manager.getRepository(EvidenceSubmissionEntity).findOne({
        where: { milestoneId: milestone.id, version: input.evidenceVersion },
      });
      if (!submission) throw new NotFoundException('Evidence version was not found');
      const assets = await manager.getRepository(EvidenceAssetEntity).find({
        where: { evidenceSubmissionId: submission.id },
        order: { id: 'ASC' },
      });
      if (!assets.length || assets.some((asset) => asset.scanStatus !== 'Passed')) {
        throw new ConflictException('Every evidence asset must pass malware scanning before review');
      }
      const latest = await manager.getRepository(EvidenceSubmissionEntity).findOne({
        where: { milestoneId: milestone.id },
        order: { version: 'DESC' },
      });
      if (latest?.version !== input.evidenceVersion) {
        throw new ConflictException('Only the latest evidence version may be reviewed');
      }
      const evidenceHash = createHash('sha256')
        .update(assets.map((asset) => `${asset.storageKey}:${asset.checksumSha256}`).join('\n'))
        .digest('hex');
      const repository = manager.getRepository(MilestoneReviewEntity);
      const review = repository.create({
        milestoneId: milestone.id,
        evidenceVersion: input.evidenceVersion,
        reviewerUserId: input.actorUserId,
        verdict: input.verdict,
        notes: input.notes.trim(),
        evidenceHash,
      });
      const saved = await repository.save(review);
      await manager.query(
        `UPDATE "milestones" SET "status" = 'UnderReview', "stateVersion" = "stateVersion" + 1, "updatedAt" = NOW() WHERE "id" = $1`,
        [milestone.id],
      );
      await manager.query(
        `UPDATE "milestones" SET "status" = $2, "stateVersion" = "stateVersion" + 1, "updatedAt" = NOW() WHERE "id" = $1`,
        [milestone.id, input.verdict],
      );
      await this.audit.appendAuditEvent(manager, {
        action: 'milestone.review.decide',
        outcome: 'Allowed',
        targetType: 'Milestone',
        targetId: milestone.id,
        actor: { userId: input.actorUserId },
        correlationId: randomUUID(),
        occurredAt: new Date(),
        afterHash: createHash('sha256')
          .update(JSON.stringify({ evidenceVersion: input.evidenceVersion, verdict: input.verdict, evidenceHash }))
          .digest('hex'),
      });
      return saved;
    });
  }
}
