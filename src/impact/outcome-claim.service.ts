import { ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { AuditPersistenceService } from '../audit/audit-persistence.service.js';
import { CallEntity } from '../publications/call.entity.js';
import { ProjectEntity } from '../publications/project.entity.js';
import {
  OutcomeClaimEntity,
  OutcomeClaimProvenance,
  type OutcomeClaimProvenance as Provenance,
} from './outcome-claim.entity.js';
import { OutcomeClaimReviewEntity } from './outcome-claim-review.entity.js';

export type CreateOutcomeClaimInput = {
  sourceType: 'Project' | 'Call';
  sourceId: string;
  claimedByUserId: string;
  metricType: string;
  value: string;
  unit: string;
  evidenceStorageKey: string;
  evidenceSha256: string;
};

@Injectable()
export class OutcomeClaimService {
  constructor(private readonly audit: AuditPersistenceService) {}

  async createSelfReported(
    manager: EntityManager,
    input: CreateOutcomeClaimInput,
  ): Promise<OutcomeClaimEntity> {
    this.assertTransaction(manager);
    this.validateClaim(input);
    const sourceEntity = input.sourceType === 'Project' ? ProjectEntity : CallEntity;
    const source = await manager.getRepository(sourceEntity).findOneBy({
      id: input.sourceId,
    });
    if (!source) {
      throw new ConflictException('Outcome source was not found');
    }
    const repository = manager.getRepository(OutcomeClaimEntity);
    return repository.save(
      repository.create({
        ...input,
        provenance: OutcomeClaimProvenance.SelfReported,
        verifierUserId: null,
        verificationNote: null,
        verifiedAt: null,
      }),
    );
  }

  async review(input: {
    manager: EntityManager;
    outcomeClaimId: string;
    reviewerUserId: string;
    provenance: Exclude<Provenance, 'SelfReported'>;
    note: string;
    correlationId: string;
  }): Promise<OutcomeClaimEntity> {
    this.assertTransaction(input.manager);
    const note = input.note.trim();
    if (!note || note.length > 1_000 || !input.correlationId.trim()) {
      throw new TypeError('Review note and correlationId are required');
    }

    const repository = input.manager.getRepository(OutcomeClaimEntity);
    const claim = await repository.findOneBy({ id: input.outcomeClaimId });
    if (!claim) {
      throw new ConflictException('Outcome claim was not found');
    }
    if (claim.claimedByUserId === input.reviewerUserId) {
      throw new ConflictException('Claimants cannot review their own outcome claims');
    }
    if (claim.provenance !== OutcomeClaimProvenance.SelfReported) {
      throw new ConflictException('Outcome claim has already been reviewed');
    }

    const verifiedAt = new Date();
    const result = await repository
      .createQueryBuilder()
      .update(OutcomeClaimEntity)
      .set({
        provenance: input.provenance,
        verifierUserId: input.reviewerUserId,
        verificationNote: note,
        verifiedAt,
      })
      .where(
        'id = :id AND provenance = :expected AND "verifierUserId" IS NULL',
        { id: claim.id, expected: OutcomeClaimProvenance.SelfReported },
      )
      .execute();

    if (result.affected !== 1) {
      throw new ConflictException('Outcome claim was reviewed concurrently');
    }

    await input.manager.getRepository(OutcomeClaimReviewEntity).save({
      outcomeClaimId: claim.id,
      reviewerUserId: input.reviewerUserId,
      provenance: input.provenance,
      note,
      correlationId: input.correlationId,
    });
    await this.audit.appendAuditEvent(input.manager, {
      action: 'outcome_claim.review',
      outcome: 'Allowed',
      targetType: 'OutcomeClaim',
      targetId: claim.id,
      actor: { userId: input.reviewerUserId },
      correlationId: input.correlationId,
      reasonCode: input.provenance,
      beforeHash: this.hashJson({
        id: claim.id,
        provenance: claim.provenance,
        verifierUserId: claim.verifierUserId,
      }),
      afterHash: this.hashJson({
        id: claim.id,
        provenance: input.provenance,
        verifierUserId: input.reviewerUserId,
        verifiedAt: verifiedAt.toISOString(),
      }),
    });

    return Object.assign(new OutcomeClaimEntity(), claim, {
      provenance: input.provenance,
      verifierUserId: input.reviewerUserId,
      verificationNote: note,
      verifiedAt,
    });
  }

  private validateClaim(input: CreateOutcomeClaimInput): void {
    if (!['Project', 'Call'].includes(input.sourceType)) {
      throw new TypeError('Outcome sourceType is invalid');
    }
    if (!input.sourceId.trim() || !input.claimedByUserId.trim()) {
      throw new TypeError('Outcome source and claimant are required');
    }
    if (!/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(input.metricType)) {
      throw new TypeError('Outcome metricType is invalid');
    }
    if (
      typeof input.value !== 'string' ||
      !/^-?(0|[1-9]\d{0,63})(\.\d{1,24})?$/.test(input.value)
    ) {
      throw new TypeError('Outcome value must be a canonical decimal string');
    }
    if (!/^[A-Za-z][A-Za-z0-9._/-]{0,31}$/.test(input.unit)) {
      throw new TypeError('Outcome unit is invalid');
    }
    if (
      !input.evidenceStorageKey.trim() ||
      input.evidenceStorageKey.split('/').some((segment) => ['.', '..'].includes(segment)) ||
      !/^[a-f0-9]{64}$/.test(input.evidenceSha256)
    ) {
      throw new TypeError('Outcome evidence key or SHA-256 checksum is invalid');
    }
  }

  private assertTransaction(manager: EntityManager): void {
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error('Outcome claim writes require an active transaction');
    }
  }

  private hashJson(value: Record<string, string | null>): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
}
