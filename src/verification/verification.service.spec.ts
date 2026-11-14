import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  VerificationCaseEntity,
  VerificationStatus,
} from './verification-case.entity.js';
import {
  VerificationDocumentEntity,
  VerificationDocumentScanStatus,
} from './verification-document.entity.js';
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
    findBy: vi.fn(async () => [
      { scanStatus: VerificationDocumentScanStatus.Passed },
    ]),
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
        : entity === VerificationDocumentEntity
          ? documentRepository
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
    headObject: vi.fn(async () => ({
      contentLength: 2048,
      checksumSha256: 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=',
      metadataChecksumSha256: 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=',
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
  it('submits a case only when every evidence document passed malware scanning', async () => {
    const harness = createHarness();
    harness.verificationCase.status = VerificationStatus.NotStarted;
    await expect(
      harness.service.submit('owner-1', 'case-1'),
    ).resolves.toMatchObject({
      status: VerificationStatus.Pending,
    });
    harness.verificationCase.status = VerificationStatus.NeedsInfo;
    harness.documentRepository.findBy.mockResolvedValue([
      { scanStatus: VerificationDocumentScanStatus.Queued },
    ] as never);
    await expect(
      harness.service.submit('owner-1', 'case-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not issue a download URL before malware scanning passes', async () => {
    const harness = createHarness();
    harness.verificationCase.status = VerificationStatus.Pending;
    harness.documentRepository.findOneBy.mockResolvedValue({
      id: 'document-1',
      verificationCaseId: 'case-1',
      objectKey: 'verification/org-1/case-1/object-1',
      scanStatus: VerificationDocumentScanStatus.Infected,
    });
    await expect(
      harness.service.createDocumentDownload('owner-1', 'case-1', 'document-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.storage.createDownloadUrl).not.toHaveBeenCalled();
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

  it.each(['NeedsInfo', 'Rejected'] as const)(
    'records the %s reviewer outcome',
    async (decision) => {
      const harness = createHarness();
      harness.verificationCase.createdByUserId = 'submitter-1';
      await harness.service.decide(
        'reviewer-1',
        'case-1',
        decision,
        'Review outcome',
      );
      expect(harness.verificationCase).toMatchObject({
        status: decision,
        decidedByUserId: 'reviewer-1',
        decisionReason: 'Review outcome',
      });
    },
  );

  it('prevents the case submitter from reviewing their own case', async () => {
    const harness = createHarness();
    await expect(
      harness.service.decide('owner-1', 'case-1', 'Verified', 'Self review'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('revokes a case and preserves the reason', async () => {
    const harness = createHarness();
    const result = await harness.service.revoke(
      'owner-1',
      'case-1',
      'Evidence withdrawn',
    );
    expect(result).toMatchObject({
      status: VerificationStatus.Revoked,
      decidedByUserId: 'owner-1',
      decisionReason: 'Evidence withdrawn',
    });
    expect(result.revokedAt).toBeInstanceOf(Date);
  });

  it('creates scoped private upload references and persists their metadata', async () => {
    const harness = createHarness();
    harness.verificationCase.status = VerificationStatus.NotStarted;
    const result = await harness.service.createDocumentUpload(
      'owner-1',
      'case-1',
      {
        fileName: 'registration.pdf',
        contentType: 'application/pdf',
        contentLength: 2048,
        checksumSha256: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      },
    );
    expect(result.url).toBe('signed-upload');
    expect(harness.storage.createUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'verification/org-1/case-1',
        contentType: 'application/pdf',
      }),
    );
    expect(harness.documentRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        objectKey: 'verification/org-1/case-1/file',
        fileName: 'registration.pdf',
        uploadedByUserId: 'owner-1',
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
