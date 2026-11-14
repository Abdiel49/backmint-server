import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CallEntity } from '../publications/call.entity.js';
import { ProjectEntity } from '../publications/project.entity.js';
import { OutcomeClaimEntity, OutcomeClaimProvenance } from './outcome-claim.entity.js';
import { OutcomeClaimReviewEntity } from './outcome-claim-review.entity.js';
import { OutcomeClaimService } from './outcome-claim.service.js';

function createService(options: { affected?: number; claimedByUserId?: string } = {}) {
  const claim = {
    id: 'claim-id',
    sourceType: 'Project',
    sourceId: 'project-id',
    claimedByUserId: options.claimedByUserId ?? 'claimant-id',
    metricType: 'people_reached',
    value: '1200',
    unit: 'people',
    evidenceStorageKey: 'outcomes/project-id/evidence.pdf',
    evidenceSha256: 'a'.repeat(64),
    provenance: OutcomeClaimProvenance.SelfReported,
    verifierUserId: null,
    verificationNote: null,
    verifiedAt: null,
  };
  const queryBuilder = {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    execute: vi.fn(async () => ({ affected: options.affected ?? 1 })),
  };
  const claimRepository = {
    findOneBy: vi.fn(async () => claim),
    create: vi.fn((value) => value),
    save: vi.fn(async (value) => value),
    createQueryBuilder: vi.fn(() => queryBuilder),
  };
  const projectRepository = { findOneBy: vi.fn(async () => ({ id: 'project-id' })) };
  const callRepository = { findOneBy: vi.fn(async () => null) };
  const reviewRepository = { save: vi.fn(async (value) => value) };
  const repositories = new Map([
    [ProjectEntity, projectRepository],
    [CallEntity, callRepository],
    [OutcomeClaimEntity, claimRepository],
    [OutcomeClaimReviewEntity, reviewRepository],
  ]);
  const manager = {
    queryRunner: { isTransactionActive: true },
    getRepository: vi.fn((entity) => repositories.get(entity)),
  };
  const audit = { appendAuditEvent: vi.fn(async () => undefined) };

  return {
    service: new OutcomeClaimService(audit as never),
    manager,
    claim,
    claimRepository,
    projectRepository,
    reviewRepository,
    audit,
  };
}

describe('OutcomeClaimService', () => {
  it('creates a self-reported claim with exact decimal text and evidence hash', async () => {
    const { service, manager, claimRepository } = createService();
    const saved = await service.createSelfReported(manager as never, {
      sourceType: 'Project',
      sourceId: 'project-id',
      claimedByUserId: 'claimant-id',
      metricType: 'people_reached',
      value: '1200.25',
      unit: 'people',
      evidenceStorageKey: 'outcomes/project-id/evidence.pdf',
      evidenceSha256: 'a'.repeat(64),
    });

    expect(saved).toMatchObject({
      value: '1200.25',
      provenance: 'SelfReported',
      verifierUserId: null,
    });
    expect(claimRepository.save).toHaveBeenCalledOnce();
  });

  it('rejects floating-point money-like metric values and invalid evidence keys', async () => {
    const { service, manager } = createService();
    await expect(
      service.createSelfReported(manager as never, {
        sourceType: 'Project',
        sourceId: 'project-id',
        claimedByUserId: 'claimant-id',
        metricType: 'people_reached',
        value: 1.25 as never,
        unit: 'people',
        evidenceStorageKey: '../private/file.pdf',
        evidenceSha256: 'a'.repeat(64),
      }),
    ).rejects.toThrow('Outcome value must be a canonical decimal string');
  });

  it('rejects a missing project or call source', async () => {
    const { service, manager, projectRepository } = createService();
    projectRepository.findOneBy.mockResolvedValue(null);

    await expect(
      service.createSelfReported(manager as never, {
        sourceType: 'Project',
        sourceId: 'missing-project',
        claimedByUserId: 'claimant-id',
        metricType: 'people_reached',
        value: '1200',
        unit: 'people',
        evidenceStorageKey: 'outcomes/evidence.pdf',
        evidenceSha256: 'a'.repeat(64),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('records reviewed provenance and an audit event in the same transaction', async () => {
    const { service, manager, reviewRepository, audit } = createService();

    const claim = await service.review({
      manager: manager as never,
      outcomeClaimId: 'claim-id',
      reviewerUserId: 'reviewer-id',
      provenance: 'IndependentlyVerified',
      note: 'Evidence independently checked',
      correlationId: 'request-correlation',
    });

    expect(claim).toMatchObject({
      provenance: 'IndependentlyVerified',
      verifierUserId: 'reviewer-id',
      verificationNote: 'Evidence independently checked',
    });
    expect(reviewRepository.save).toHaveBeenCalledOnce();
    expect(audit.appendAuditEvent).toHaveBeenCalledOnce();
  });

  it('rejects self-review and concurrent reviewer updates', async () => {
    const selfReview = createService({ claimedByUserId: 'reviewer-id' });
    await expect(
      selfReview.service.review({
        manager: selfReview.manager as never,
        outcomeClaimId: 'claim-id',
        reviewerUserId: 'reviewer-id',
        provenance: 'Reviewed',
        note: 'Looks right',
        correlationId: 'request-correlation',
      }),
    ).rejects.toThrow('Claimants cannot review their own outcome claims');

    const concurrent = createService({ affected: 0 });
    await expect(
      concurrent.service.review({
        manager: concurrent.manager as never,
        outcomeClaimId: 'claim-id',
        reviewerUserId: 'reviewer-id',
        provenance: 'Reviewed',
        note: 'Looks right',
        correlationId: 'request-correlation',
      }),
    ).rejects.toThrow('Outcome claim was reviewed concurrently');
  });
});
