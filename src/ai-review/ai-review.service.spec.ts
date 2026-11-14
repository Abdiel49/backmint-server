import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DataSource, Repository } from 'typeorm';
import {
  ApplicationAnswerEntity,
  ApplicationEntity,
} from '../publications/application.entity.js';
import { AIReviewConsentEntity } from './ai-review-consent.entity.js';
import { AIReviewEntity } from './ai-review.entity.js';
import { AIReviewService } from './ai-review.service.js';

function createService() {
  const application = {
    id: '8b0f1835-4c3c-41ec-9f91-f370f59e7614',
    sourceId: '82cfdfba-718f-4bf2-a245-46272f924ce8',
    applicantUserId: 'user-1',
    applicantOrganizationId: null,
    sourceSnapshot: {},
    applicantSnapshot: {},
    proposalSnapshot: {},
  } as ApplicationEntity;
  const answerId = '98d913dc-334c-4d53-87f0-a857ab9ad383';
  const answers = {
    find: vi.fn().mockResolvedValue([
      {
        id: answerId,
        answer: { team: { experience: 'Three years' } },
        attachmentIds: [],
      } as ApplicationAnswerEntity,
    ]),
  };
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
    answers as unknown as Repository<ApplicationAnswerEntity>,
    consents as unknown as Repository<AIReviewConsentEntity>,
    reviews as unknown as Repository<AIReviewEntity>,
  );
  return {
    service,
    application,
    consent,
    applications,
    answers,
    consents,
    reviews,
  };
}

const input = {
  applicationId: '8b0f1835-4c3c-41ec-9f91-f370f59e7614',
  modelProvider: 'openai',
  modelName: 'review-model',
  modelVersion: '2026-10-15',
  promptVersion: 'application-review-v2',
  citedSources: [
    {
      sourceType: 'Answer' as const,
      sourceId: '98d913dc-334c-4d53-87f0-a857ab9ad383',
      fieldPath: 'team.experience',
    },
  ],
  uncertaintyFlags: ['Evidence is self-reported'],
  advisoryOutput: {
    summary: 'The application describes an early pilot.',
    observations: ['The proposed timeline is stated in the application.'],
  },
};

describe('AIReviewService', () => {
  it('limits requested consent retention to one year', async () => {
    const { service } = createService();

    await expect(
      service.grantConsent(
        '8b0f1835-4c3c-41ec-9f91-f370f59e7614',
        'user-1',
        366,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

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

  it('rejects citations to answers or fields outside the application', async () => {
    const { service, reviews } = createService();

    await expect(
      service.recordAdvisoryOutput({
        ...input,
        citedSources: [
          {
            sourceType: 'Answer',
            sourceId: 'b6fca21d-3e0d-4b32-aee5-0db0e9a112ac',
            fieldPath: 'team.experience',
          },
        ],
      }),
    ).rejects.toThrow('fields captured for this application');
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
      service.listForApplicant(
        '8b0f1835-4c3c-41ec-9f91-f370f59e7614',
        'another-user',
      ),
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
