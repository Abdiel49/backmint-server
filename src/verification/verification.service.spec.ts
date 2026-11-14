import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  VerificationCaseEntity,
  VerificationStatus,
} from './verification-case.entity.js';
import { VerificationService } from './verification.service.js';

function createHarness() {
  const verificationCase = {
    id: 'case-1',
    organizationId: 'org-1',
    status: VerificationStatus.Pending,
    createdByUserId: 'owner-1',
    decidedByUserId: null,
    decisionReason: null,
    expiresAt: null,
    revokedAt: null,
  } as VerificationCaseEntity;
  const caseRepository = {
    findOneBy: vi.fn(async () => verificationCase),
    create: vi.fn((value) => value),
    save: vi.fn(async (value) => value),
    createQueryBuilder: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      execute: vi.fn(async () => ({ affected: 1 })),
    })),
  };
  const documentRepository = {
    existsBy: vi.fn(async () => true),
    findOneBy: vi.fn(),
    save: vi.fn(async (value) => value),
    create: vi.fn((value) => value),
  };
  const reviewRepository = {
    save: vi.fn(async (value) => value),
    create: vi.fn((value) => value),
  };
  const lockedCaseRepository = {
    findOne: vi.fn(async () => verificationCase),
    save: vi.fn(async (value) => value),
  };
  const transactionalReviewRepository = {
    save: vi.fn(async (value) => value),
    create: vi.fn((value) => value),
  };
  const manager = {
    getRepository: vi.fn((entity) =>
      entity === VerificationCaseEntity
        ? lockedCaseRepository
        : transactionalReviewRepository,
    ),
  };
  const transaction = vi.fn(async (callback) => callback(manager));
  (caseRepository as { manager?: unknown }).manager = { transaction };
  const organizationRepository = {
    findOneBy: vi.fn(async () => ({ id: 'org-1', ownerUserId: 'owner-1' })),
  };
  const membershipRepository = {
    findOneBy: vi.fn(async (where) => ({
      organizationId: 'org-1',
      userId: where.userId,
      role: where.userId === 'reviewer-1' ? 'Evaluator' : 'Owner',
      status: 'Active',
    })),
  };
  const storage = {
    createUploadUrl: vi.fn(async () => ({
      key: 'verification/org-1/case-1/file',
      url: 'signed-upload',
      expiresAt: new Date(),
    })),
    createDownloadUrl: vi.fn(async () => ({
      key: 'verification/org-1/case-1/file',
      url: 'signed-download',
      expiresAt: new Date(),
    })),
  };
  const service = new VerificationService(
    caseRepository as never,
    documentRepository as never,
    reviewRepository as never,
    organizationRepository as never,
    membershipRepository as never,
    storage as never,
  );
  return {
    service,
    verificationCase,
    caseRepository,
    documentRepository,
    reviewRepository,
    transactionalReviewRepository,
    lockedCaseRepository,
    organizationRepository,
    membershipRepository,
    storage,
  };
}

describe('VerificationService', () => {
  it('submits a case only when evidence metadata exists', async () => {
    const harness = createHarness();
    harness.verificationCase.status = VerificationStatus.NotStarted;
    await expect(
      harness.service.submit('owner-1', 'case-1'),
    ).resolves.toMatchObject({
      status: VerificationStatus.Pending,
    });
    harness.verificationCase.status = VerificationStatus.NeedsInfo;
    harness.documentRepository.existsBy.mockResolvedValue(false);
    await expect(
      harness.service.submit('owner-1', 'case-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('records reviewer decisions and verification expiry', async () => {
    const harness = createHarness();
    harness.verificationCase.createdByUserId = 'submitter-1';
    const expiry = new Date(Date.now() + 86_400_000);
    const result = await harness.service.decide(
      'reviewer-1',
      'case-1',
      'Verified',
      'Documents match registry',
      expiry,
    );
    expect(result).toMatchObject({
      status: VerificationStatus.Verified,
      expiresAt: expiry,
    });
    expect(harness.lockedCaseRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'case-1' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(harness.transactionalReviewRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewerUserId: 'reviewer-1',
        decision: 'Verified',
      }),
    );
  });

  it('hides verification cases from users outside the organization', async () => {
    const harness = createHarness();
    harness.membershipRepository.findOneBy.mockResolvedValue(null);
    await expect(
      harness.service.getCase('outsider-1', 'case-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not expose private evidence to observers', async () => {
    const harness = createHarness();
    harness.membershipRepository.findOneBy.mockResolvedValue({
      organizationId: 'org-1',
      userId: 'observer-1',
      role: 'Observer',
      status: 'Active',
    });
    await expect(
      harness.service.getCase('observer-1', 'case-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('expires verified cases whose expiry has passed', async () => {
    const harness = createHarness();
    await expect(harness.service.expireDue(new Date())).resolves.toBe(1);
  });
});
