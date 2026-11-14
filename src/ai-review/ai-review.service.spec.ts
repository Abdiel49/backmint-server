import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DataSource, Repository } from 'typeorm';
import { ApplicationEntity } from '../publications/application.entity.js';
import { AIReviewConsentEntity } from './ai-review-consent.entity.js';
import { AIReviewEntity } from './ai-review.entity.js';
import { AIReviewService } from './ai-review.service.js';

function createService() {
  const application = {
    id: 'app-1',
    applicantUserId: 'user-1',
  } as ApplicationEntity;
  const consent = {
    id: 'consent-1',
    applicationId: 'app-1',
    userId: 'user-1',
    retentionUntil: new Date(Date.now() + 60_000),
    withdrawnAt: null,
  } as AIReviewConsentEntity;
  const review = { id: 'review-1' } as AIReviewEntity;
  const applications = { findOne: vi.fn().mockResolvedValue(application) };
  const consents = { findOne: vi.fn().mockResolvedValue(consent) };
  const reviews = {
    create: vi.fn((value) => value),
    save: vi.fn().mockResolvedValue(review),
    find: vi.fn().mockResolvedValue([review]),
  };
  const dataSource = {} as DataSource;
  const service = new AIReviewService(
    dataSource,
    applications as unknown as Repository<ApplicationEntity>,
    consents as unknown as Repository<AIReviewConsentEntity>,
    reviews as unknown as Repository<AIReviewEntity>,
  );
  return { service, application, consent, applications, consents, reviews };
}

const input = {
  applicationId: 'app-1',
  modelProvider: 'openai',
  modelName: 'review-model',
  modelVersion: '2026-10-15',
  promptVersion: 'application-review-v2',
  citedSources: [
    {
      sourceType: 'Answer' as const,
      sourceId: '98d913dc-334c-4d53-87f0-a857ab9ad383',
      fieldPath: 'team.experience',
      documentId: '3b33c29f-e525-4319-9a63-66cf4b62e93b',
    },
  ],
  uncertaintyFlags: ['Evidence is self-reported'],
  advisoryOutput: {
    summary: 'The application describes an early pilot.',
    observations: ['The proposed timeline is stated in the application.'],
  },
};

describe('AIReviewService', () => {
  it('persists model and prompt provenance, source citations and uncertainty separately from Evaluation', async () => {
    const { service, reviews, consent } = createService();

    await service.recordAdvisoryOutput(input);

    expect(reviews.create).toHaveBeenCalledWith({
      ...input,
      consentId: consent.id,
      retentionUntil: consent.retentionUntil,
    });
    expect(reviews.save).toHaveBeenCalledOnce();
  });

  it('refuses to record output without source citations', async () => {
    const { service, reviews } = createService();

    await expect(
      service.recordAdvisoryOutput({ ...input, citedSources: [] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(reviews.save).not.toHaveBeenCalled();
  });

  it('rejects action or decision fields from the advisory output structure', async () => {
    const { service, reviews } = createService();

    await expect(
      service.recordAdvisoryOutput({
        ...input,
        advisoryOutput: {
          ...input.advisoryOutput,
          selection: 'Selected',
        } as never,
      }),
    ).rejects.toThrow('advisory summary and observations only');
    expect(reviews.save).not.toHaveBeenCalled();
  });

  it('requires current consent before output can be stored', async () => {
    const { service, consents, reviews } = createService();
    consents.findOne.mockResolvedValue(null);

    await expect(service.recordAdvisoryOutput(input)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(reviews.save).not.toHaveBeenCalled();
  });

  it('hides application data from users who are not its applicant', async () => {
    const { service } = createService();

    await expect(
      service.listForApplicant('app-1', 'another-user'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('exposes only advisory persistence operations and retention cleanup', () => {
    expect(
      Object.getOwnPropertyNames(AIReviewService.prototype).sort(),
    ).toEqual([
      'constructor',
      'grantConsent',
      'listForApplicant',
      'purgeExpiredReviews',
      'recordAdvisoryOutput',
      'withdrawConsent',
    ]);
  });
});
