import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import {
  ApplicationAnswerEntity,
  ApplicationEntity,
} from '../publications/application.entity.js';
import { AIReviewConsentEntity } from './ai-review-consent.entity.js';
import {
  aiReviewAdvisoryOutputSchema,
  recordAIReviewInputSchema,
} from './ai-review.dto.js';
import {
  AIReviewEntity,
  type AIReviewAdvisoryOutput,
  type AIReviewSourceReference,
} from './ai-review.entity.js';

const consentPolicyVersion = 'ai-review-v1';
const defaultRetentionDays = 90;

function hasFieldPath(value: unknown, fieldPath: string): boolean {
  let current: unknown = value;
  for (const segment of fieldPath.split('.')) {
    if (
      typeof current !== 'object' ||
      current === null ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    )
      return false;
    current = (current as Record<string, unknown>)[segment];
  }
  return true;
}

export type RecordAIReviewInput = Readonly<{
  applicationId: string;
  modelProvider: string;
  modelName: string;
  modelVersion: string;
  promptVersion: string;
  citedSources: AIReviewSourceReference[];
  uncertaintyFlags: string[];
  advisoryOutput: AIReviewAdvisoryOutput;
}>;

@Injectable()
export class AIReviewService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ApplicationEntity)
    private readonly applications: Repository<ApplicationEntity>,
    @InjectRepository(ApplicationAnswerEntity)
    private readonly answers: Repository<ApplicationAnswerEntity>,
    @InjectRepository(AIReviewConsentEntity)
    private readonly consents: Repository<AIReviewConsentEntity>,
    @InjectRepository(AIReviewEntity)
    private readonly reviews: Repository<AIReviewEntity>,
  ) {}

  async grantConsent(
    applicationId: string,
    userId: string,
    retentionDays = defaultRetentionDays,
  ) {
    if (
      !Number.isInteger(retentionDays) ||
      retentionDays < 1 ||
      retentionDays > 365
    )
      throw new BadRequestException(
        'AI review retention must be between 1 and 365 days',
      );
    const application = await this.applications.findOne({
      where: { id: applicationId },
    });
    if (!application || application.applicantUserId !== userId) {
      throw new NotFoundException('Application was not found');
    }

    return this.dataSource.transaction(async (manager) => {
      const consents = manager.getRepository(AIReviewConsentEntity);
      const current = await consents.findOne({
        where: { applicationId, userId, withdrawnAt: IsNull() },
      });
      if (current && current.retentionUntil > new Date()) {
        return current;
      }
      if (current) {
        current.withdrawnAt = new Date();
        await consents.save(current);
      }

      const grantedAt = new Date();
      return consents.save(
        consents.create({
          applicationId,
          userId,
          policyVersion: consentPolicyVersion,
          retentionDays,
          grantedAt,
          retentionUntil: new Date(
            grantedAt.getTime() + retentionDays * 86_400_000,
          ),
          withdrawnAt: null,
        }),
      );
    });
  }

  async withdrawConsent(applicationId: string, userId: string): Promise<void> {
    const application = await this.applications.findOne({
      where: { id: applicationId },
    });
    if (!application || application.applicantUserId !== userId) {
      throw new NotFoundException('Application was not found');
    }

    await this.dataSource.transaction(async (manager) => {
      const consents = manager.getRepository(AIReviewConsentEntity);
      const consent = await consents.findOne({
        where: { applicationId, userId, withdrawnAt: IsNull() },
      });
      if (!consent) return;
      consent.withdrawnAt = new Date();
      await consents.save(consent);
      await manager
        .getRepository(AIReviewEntity)
        .delete({ consentId: consent.id });
    });
  }

  async listForApplicant(
    applicationId: string,
    userId: string,
  ): Promise<AIReviewEntity[]> {
    const application = await this.applications.findOne({
      where: { id: applicationId },
    });
    if (!application || application.applicantUserId !== userId) {
      throw new NotFoundException('Application was not found');
    }
    const consent = await this.consents.findOne({
      where: { applicationId, userId, withdrawnAt: IsNull() },
    });
    if (!consent || consent.retentionUntil <= new Date()) return [];

    return this.reviews.find({
      where: { applicationId, consentId: consent.id },
      order: { createdAt: 'DESC' },
    });
  }

  async recordAdvisoryOutput(
    input: RecordAIReviewInput,
  ): Promise<AIReviewEntity> {
    if (!Array.isArray(input.citedSources) || input.citedSources.length === 0) {
      throw new ForbiddenException(
        'AI review output must cite at least one source',
      );
    }
    if (!aiReviewAdvisoryOutputSchema.safeParse(input.advisoryOutput).success) {
      throw new BadRequestException(
        'AI review output must contain advisory summary and observations only',
      );
    }
    if (!recordAIReviewInputSchema.safeParse(input).success) {
      throw new BadRequestException(
        'AI review provenance, citations, and uncertainty flags are invalid',
      );
    }
    const application = await this.applications.findOne({
      where: { id: input.applicationId },
    });
    if (!application) throw new NotFoundException('Application was not found');
    const answers = await this.answers.find({
      where: { applicationId: application.id },
    });
    const citationsMatchApplication = input.citedSources.every((source) => {
      if (source.sourceType === 'Application')
        return (
          source.sourceId === application.id &&
          hasFieldPath(application, source.fieldPath)
        );
      if (source.sourceType === 'Source')
        return (
          source.sourceId === application.sourceId &&
          hasFieldPath(application.sourceSnapshot, source.fieldPath)
        );
      if (source.sourceType === 'Applicant')
        return (
          (source.sourceId === application.applicantUserId ||
            source.sourceId === application.applicantOrganizationId) &&
          hasFieldPath(application.applicantSnapshot, source.fieldPath)
        );
      if (source.sourceType === 'Proposal')
        return (
          source.sourceId === application.id &&
          hasFieldPath(application.proposalSnapshot, source.fieldPath)
        );
      const answer = answers.find(
        (candidate) => candidate.id === source.sourceId,
      );
      if (source.sourceType === 'Answer')
        return Boolean(answer && hasFieldPath(answer.answer, source.fieldPath));
      return Boolean(
        answer &&
        source.documentId &&
        source.fieldPath === 'attachmentIds' &&
        answer.attachmentIds.includes(source.documentId),
      );
    });
    if (!citationsMatchApplication) {
      throw new BadRequestException(
        'AI review citations must reference fields captured for this application',
      );
    }
    const consent = await this.consents.findOne({
      where: { applicationId: input.applicationId, withdrawnAt: IsNull() },
      order: { grantedAt: 'DESC' },
    });
    if (!consent || consent.retentionUntil <= new Date()) {
      throw new ForbiddenException('Active AI review consent is required');
    }
    return this.reviews.save(
      this.reviews.create({
        ...input,
        consentId: consent.id,
        retentionUntil: consent.retentionUntil,
      }),
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeExpiredReviews(): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const now = new Date();
      await manager
        .getRepository(AIReviewEntity)
        .createQueryBuilder()
        .delete()
        .where('"retentionUntil" <= :now', { now })
        .execute();
      await manager
        .getRepository(AIReviewConsentEntity)
        .createQueryBuilder()
        .delete()
        .where('"retentionUntil" <= :now OR "withdrawnAt" <= :now', { now })
        .execute();
    });
  }
}
