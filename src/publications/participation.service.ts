import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { CallEntity, CallVersionEntity } from './call.entity.js';
import { ProjectEntity, ProjectVersionEntity } from './project.entity.js';
import {
  ApplicationAnswerEntity,
  ApplicationEntity,
  FundingOfferEntity,
} from './application.entity.js';
import { OrganizationEntity } from '../organizations/organization.entity.js';
import { OrganizationMembershipEntity } from '../organizations/organization-membership.entity.js';
import { OrganizationRepresentativeEntity } from '../organizations/organization-representative.entity.js';
import { UserEntity } from '../identity/user.entity.js';
import {
  FundingDirection,
  PublicationIntake,
  PublicationLifecycle,
  PublicationSourceType,
  SubmissionType,
  type OpportunityPolicyDefinition,
  type PublicationSnapshot,
  type QuestionnaireQuestion,
} from './publication.types.js';
import { assertSubmissionDirection } from './publication.validation.js';
import { assertApplicantAudience, assertApplicantJurisdiction } from './eligibility-policy.js';
import { ApplicationAttachmentEntity } from './application-attachment.entity.js';
import { reconcileApplicationScans } from './application-scan-reconciliation.js';

export type ApplicationSubmission = {
  sourceType: PublicationSourceType;
  sourceId: string;
  applicantUserId?: string;
  applicantOrganizationId?: string;
  referencedProjectId?: string;
  proposal: Record<string, unknown>;
  answers: Array<{
    questionKey: string;
    answer: unknown;
    attachmentIds?: string[];
  }>;
};

export type FundingOfferSubmission = {
  sourceType: PublicationSourceType;
  sourceId: string;
  funderUserId?: string;
  funderOrganizationId?: string;
  amount?: string;
  asset?: string;
  supportDescription?: string;
  supportType?: string;
  restrictedPurpose?: string;
  conditions: Record<string, unknown>;
};

@Injectable()
export class ParticipationService {
  constructor(private readonly dataSource: DataSource) {}

  async submitApplication(
    input: ApplicationSubmission,
  ): Promise<ApplicationEntity> {
    return this.createApplication(input, null);
  }

  async resubmitApplication(
    previousApplicationId: string,
    userId: string,
    input: Pick<
      ApplicationSubmission,
      'proposal' | 'answers' | 'referencedProjectId'
    >,
  ): Promise<ApplicationEntity> {
    return this.dataSource.transaction(async (manager) => {
      const previous = await manager
        .getRepository(ApplicationEntity)
        .createQueryBuilder('application')
        .setLock('pessimistic_write')
        .where('application.id = :id', { id: previousApplicationId })
        .getOne();
      if (!previous) throw new NotFoundException('Application not found');
      await this.assertApplicationActor(manager, previous, userId);
      if (previous.status !== 'Withdrawn') {
        throw new BadRequestException(
          'Only withdrawn Applications can be resubmitted',
        );
      }
      const existingResubmission = await manager
        .getRepository(ApplicationEntity)
        .findOneBy({
          supersedesApplicationId: previous.id,
        });
      if (existingResubmission) {
        throw new ConflictException('Application already has a resubmission');
      }
      const application = await this.createApplicationInTransaction(
        manager,
        {
          ...input,
          sourceType: previous.sourceType as PublicationSourceType,
          sourceId: previous.sourceId,
          applicantUserId: previous.applicantUserId ?? undefined,
          applicantOrganizationId:
            previous.applicantOrganizationId ?? undefined,
        },
        previous.id,
      );
      return application;
    });
  }

  async withdrawApplication(
    applicationId: string,
    userId: string,
  ): Promise<ApplicationEntity> {
    return this.dataSource.transaction(async (manager) => {
      const application = await manager
        .getRepository(ApplicationEntity)
        .createQueryBuilder('application')
        .setLock('pessimistic_write')
        .where('application.id = :id', { id: applicationId })
        .getOne();
      if (!application) throw new NotFoundException('Application not found');
      await this.assertApplicationActor(manager, application, userId);
      if (
        ![
          'Submitted',
          'PendingFileScan',
          'UnderReview',
          'NeedsInformation',
        ].includes(application.status)
      ) {
        throw new BadRequestException('Application can no longer be withdrawn');
      }
      application.status = 'Withdrawn';
      application.withdrawnAt = new Date();
      return manager.getRepository(ApplicationEntity).save(application);
    });
  }

  private async assertApplicationActor(
    manager: EntityManager,
    application: ApplicationEntity,
    userId: string,
  ): Promise<void> {
    if (application.applicantUserId === userId) return;
    const organizationId = application.applicantOrganizationId;
    if (!organizationId) throw new NotFoundException('Application not found');
    const membership = await manager
      .getRepository(OrganizationMembershipEntity)
      .findOne({ where: { organizationId, userId, status: 'Active' } });
    if (!membership) throw new NotFoundException('Application not found');
    if (['Owner', 'Admin', 'ProjectManager'].includes(membership.role)) return;
    if (membership.role === 'Representative') {
      const authority = await manager
        .getRepository(OrganizationRepresentativeEntity)
        .findOne({ where: { organizationId, userId, revokedAt: IsNull() } });
      if (
        authority &&
        authority.verifiedAt <= new Date() &&
        authority.expiresAt > new Date()
      ) {
        return;
      }
    }
    throw new NotFoundException('Application not found');
  }

  private async createApplication(
    input: ApplicationSubmission,
    supersedesApplicationId: string | null,
  ): Promise<ApplicationEntity> {
    return this.dataSource.transaction((manager) =>
      this.createApplicationInTransaction(
        manager,
        input,
        supersedesApplicationId,
      ),
    );
  }

  private async createApplicationInTransaction(
    manager: EntityManager,
    input: ApplicationSubmission,
    supersedesApplicationId: string | null,
  ): Promise<ApplicationEntity> {
    assertSubmissionDirection(
      FundingDirection.FundingOffered,
      SubmissionType.Application,
    );
    this.assertSingleApplicant(
      input.applicantUserId,
      input.applicantOrganizationId,
    );

    const source = await this.lockSource(
      manager,
      input.sourceType,
      input.sourceId,
    );
    this.assertIntake(source, FundingDirection.FundingOffered);
    if (
      supersedesApplicationId &&
      source.content.opportunityPolicy?.allowReapply !== true
    ) {
      throw new BadRequestException('This source does not allow resubmission');
    }
    const applicant = await this.loadApplicant(manager, input);
    this.assertEligibility(source.content, applicant);
    const applicantKey = input.applicantOrganizationId
      ? `organization:${input.applicantOrganizationId}`
      : `user:${input.applicantUserId}`;
    await this.assertApplicationQuota(
      manager,
      input,
      applicantKey,
      source.content.opportunityPolicy,
    );
    this.assertAnswers(
      source.content.questionnaire?.questions ?? [],
      input.answers,
    );
    const attachmentIds = input.answers.flatMap((answer) => answer.attachmentIds ?? []).map((id) => id.toLowerCase());
    if (new Set(attachmentIds).size !== attachmentIds.length)
      throw new BadRequestException('Application attachment identifiers must be unique');
    if (attachmentIds.length) {
      const attachments = await manager.getRepository(ApplicationAttachmentEntity).find({
        where: { id: In(attachmentIds) },
        order: { id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      if (attachments.length !== attachmentIds.length || attachments.some((attachment) =>
        attachment.applicationId !== null || !['PendingUpload', 'Uploaded', 'Clean'].includes(attachment.status) ||
        (input.applicantOrganizationId
          ? attachment.organizationId !== input.applicantOrganizationId
          : attachment.organizationId !== null || attachment.uploadedByUserId !== input.applicantUserId)))
        throw new BadRequestException('Application attachment is unavailable');
    }
    if (input.referencedProjectId) {
      const referenced = await manager
        .getRepository(ProjectEntity)
        .findOneBy({ id: input.referencedProjectId });
      if (!referenced)
        throw new BadRequestException('Referenced Project was not found');
    }
    const sourceVersion = await this.currentSourceVersion(
      manager,
      input.sourceType,
      source.id,
    );
    const pendingFileScan = input.answers.some(
      (answer) => answer.attachmentIds?.length,
    );
    const application = await manager.getRepository(ApplicationEntity).save(
      manager.getRepository(ApplicationEntity).create({
        sourceType: input.sourceType,
        sourceId: source.id,
        supersedesApplicationId,
        applicantOrganizationId: input.applicantOrganizationId ?? null,
        applicantUserId: input.applicantUserId ?? null,
        applicantKey,
        referencedProjectId: input.referencedProjectId ?? null,
        sourceVersion,
        sourceSnapshot: structuredClone(source.content),
        applicantSnapshot: applicant,
        proposalSnapshot: structuredClone(input.proposal),
        status: pendingFileScan ? 'PendingFileScan' : 'Submitted',
        receipt: randomUUID(),
      }),
    );
    if (attachmentIds.length)
      await manager.getRepository(ApplicationAttachmentEntity).update({ id: In(attachmentIds) }, { applicationId: application.id });
    const answerRepository = manager.getRepository(ApplicationAnswerEntity);
    await answerRepository.save(
      input.answers.map((answer) =>
        answerRepository.create({
          applicationId: application.id,
          questionKey: answer.questionKey,
          answer: structuredClone(answer.answer),
          attachmentIds: answer.attachmentIds ?? [],
          fileScanStatus: answer.attachmentIds?.length
            ? 'Pending'
            : 'NotRequired',
        }),
      ),
    );
    if (pendingFileScan) {
      await reconcileApplicationScans(manager, application.id);
      const current = await manager.getRepository(ApplicationEntity).findOneByOrFail({ id: application.id });
      application.status = current.status;
    }
    return application;
  }

  async submitFundingOffer(
    input: FundingOfferSubmission,
  ): Promise<FundingOfferEntity> {
    assertSubmissionDirection(
      FundingDirection.FundingRequested,
      SubmissionType.FundingOffer,
    );
    this.assertSingleApplicant(input.funderUserId, input.funderOrganizationId);
    this.assertOfferValue(input);

    return this.dataSource.transaction(async (manager) => {
      const source = await this.lockSource(
        manager,
        input.sourceType,
        input.sourceId,
      );
      this.assertIntake(source, FundingDirection.FundingRequested);
      const funder = await this.loadApplicant(manager, {
        applicantUserId: input.funderUserId,
        applicantOrganizationId: input.funderOrganizationId,
      });
      this.assertEligibility(source.content, funder);
      this.assertJurisdiction(source.content, funder);
      const asset = input.asset?.trim();
      if (input.amount && source.targetAsset && asset !== source.targetAsset) {
        throw new BadRequestException(
          'Offer asset does not match the publication asset',
        );
      }
      if (
        input.amount &&
        source.hardCapEnabled &&
        BigInt(input.amount) > BigInt(source.hardCapAmount!)
      ) {
        throw new BadRequestException('Offer exceeds the publication hard cap');
      }
      if (input.supportDescription) {
        if (!input.supportType?.trim()) {
          throw new BadRequestException(
            'In-kind support requires a support type',
          );
        }
        if (!source.content.supportTypes?.includes(input.supportType.trim())) {
          throw new BadRequestException(
            'This publication does not accept the offered support type',
          );
        }
      }
      const sourceVersion = await this.currentSourceVersion(
        manager,
        input.sourceType,
        source.id,
      );
      return manager.getRepository(FundingOfferEntity).save(
        manager.getRepository(FundingOfferEntity).create({
          sourceType: input.sourceType,
          sourceId: source.id,
          funderOrganizationId: input.funderOrganizationId ?? null,
          funderUserId: input.funderUserId ?? null,
          amount: input.amount ?? null,
          asset: asset ?? null,
          supportDescription: input.supportDescription?.trim() ?? null,
          supportType: input.supportType?.trim() ?? null,
          restrictedPurpose: input.restrictedPurpose?.trim() ?? null,
          conditionsSnapshot: structuredClone(input.conditions),
          sourceSnapshot: { ...structuredClone(source.content), funder },
          sourceVersion,
          status: 'Submitted',
          receipt: randomUUID(),
        }),
      );
    });
  }

  async reviewFundingOffer(
    id: string,
    reviewerUserId: string,
    decision: 'UnderReview' | 'Accepted' | 'Declined',
  ): Promise<FundingOfferEntity> {
    return this.dataSource.transaction(async (manager) => {
      const offer = await manager.getRepository(FundingOfferEntity).findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!offer) throw new NotFoundException('FundingOffer not found');
      const source = await this.lockSource(
        manager,
        offer.sourceType as PublicationSourceType,
        offer.sourceId,
      );
      await this.assertPublicationReviewer(manager, source, reviewerUserId);
      if (offer.status !== 'Submitted' && offer.status !== 'UnderReview') {
        throw new BadRequestException('FundingOffer can no longer be reviewed');
      }
      if (decision === 'Accepted') {
        this.assertIntake(source, FundingDirection.FundingRequested);
        if (
          offer.amount &&
          offer.asset &&
          source.targetAsset &&
          offer.asset !== source.targetAsset
        ) {
          throw new BadRequestException(
            'Offer asset does not match the publication asset',
          );
        }
        await this.assertAcceptedOffersWithinCap(manager, source, offer);
      }
      offer.status = decision;
      offer.reviewedByUserId = reviewerUserId;
      offer.reviewedAt = new Date();
      return manager.getRepository(FundingOfferEntity).save(offer);
    });
  }

  private async lockSource(
    manager: EntityManager,
    type: PublicationSourceType,
    id: string,
  ): Promise<ProjectEntity | CallEntity> {
    const repository = manager.getRepository(
      type === PublicationSourceType.Project ? ProjectEntity : CallEntity,
    );
    const source = await repository.findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!source) throw new NotFoundException(`${type} not found`);
    return source;
  }

  private assertIntake(
    source: ProjectEntity | CallEntity,
    direction: FundingDirection,
  ): void {
    assertSubmissionDirection(
      source.direction as FundingDirection,
      direction === FundingDirection.FundingOffered
        ? SubmissionType.Application
        : SubmissionType.FundingOffer,
    );
    if (source.direction !== direction)
      throw new BadRequestException(
        'Submission direction does not match source',
      );
    const now = Date.now();
    if (
      source.intakeStatus !== PublicationIntake.Open ||
      ![PublicationLifecycle.Published, PublicationLifecycle.Active].includes(
        source.lifecycleStatus as never,
      )
    ) {
      throw new BadRequestException('Publication intake is not open');
    }
    if (source.intakeOpensAt && source.intakeOpensAt.getTime() > now)
      throw new BadRequestException('Publication intake has not opened');
    if (source.intakeClosesAt && source.intakeClosesAt.getTime() <= now)
      throw new BadRequestException('Publication intake has closed');
  }

  private assertSingleApplicant(
    userId?: string,
    organizationId?: string,
  ): void {
    if ((userId === undefined) === (organizationId === undefined))
      throw new BadRequestException(
        'Provide exactly one user or organization applicant',
      );
  }

  private async loadApplicant(
    manager: EntityManager,
    input: { applicantUserId?: string; applicantOrganizationId?: string },
  ): Promise<Record<string, unknown>> {
    if (input.applicantOrganizationId) {
      const organization = await manager
        .getRepository(OrganizationEntity)
        .findOneBy({ id: input.applicantOrganizationId, status: 'Active' });
      if (!organization)
        throw new ForbiddenException('Applicant organization is unavailable');
      return {
        type: organization.organizationType,
        country: organization.country,
        legalStatus: organization.legalStatus,
        organizationId: organization.id,
      };
    }
    const user = await manager
      .getRepository(UserEntity)
      .findOneBy({ id: input.applicantUserId, status: 'Active' });
    if (!user) throw new ForbiddenException('Applicant user is unavailable');
    return {
      type: 'Individual',
      displayName: user.displayName,
      userId: user.id,
    };
  }

  private assertEligibility(
    snapshot: PublicationSnapshot,
    applicant: Record<string, unknown>,
  ): void {
    const rule = snapshot.eligibilityRule;
    if (!rule) return;
    assertApplicantAudience(rule, applicant.type);
    if (rule.verificationLevel)
      throw new ForbiddenException(
        'Required verification data is not available',
      );
    this.assertJurisdiction(snapshot, applicant);
    if (rule.minRequirements && Object.keys(rule.minRequirements).length)
      throw new ForbiddenException(
        'Required eligibility evidence is not available',
      );
  }

  private assertJurisdiction(
    snapshot: PublicationSnapshot,
    applicant: Record<string, unknown>,
  ): void {
    assertApplicantJurisdiction(snapshot.eligibilityRule, applicant.country);
  }

  private async assertApplicationQuota(
    manager: EntityManager,
    input: ApplicationSubmission,
    key: string,
    policy?: OpportunityPolicyDefinition,
  ): Promise<void> {
    const query = manager
      .getRepository(ApplicationEntity)
      .createQueryBuilder('application')
      .where(
        'application."sourceType" = :sourceType AND application."sourceId" = :sourceId AND application."applicantKey" = :key AND application."status" <> :withdrawn',
        {
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          key,
          withdrawn: 'Withdrawn',
        },
      );
    const count = await query.getCount();
    if (count > 0 && policy?.allowReapply !== true)
      throw new ForbiddenException(
        'Applicant has already submitted to this publication',
      );
    if (
      policy?.maxApplicationsPerApplicant !== undefined &&
      count >= policy.maxApplicationsPerApplicant
    )
      throw new ForbiddenException(
        'Applicant application quota has been reached',
      );
  }

  private assertAnswers(
    questions: QuestionnaireQuestion[],
    answers: ApplicationSubmission['answers'],
  ): void {
    const byKey = new Map(
      answers.map((answer) => [answer.questionKey, answer]),
    );
    if (byKey.size !== answers.length)
      throw new BadRequestException('Question answers must have unique keys');
    for (const answer of answers)
      if (!questions.some((question) => question.id === answer.questionKey))
        throw new BadRequestException(
          `Unknown question: ${answer.questionKey}`,
        );
    for (const question of questions) {
      const answer = byKey.get(question.id);
      if (
        question.required &&
        (!answer ||
          answer.answer === null ||
          answer.answer === undefined ||
          answer.answer === '')
      )
        throw new BadRequestException(
          `Required answer is missing: ${question.id}`,
        );
      if (answer && question.options?.length) {
        const selections = Array.isArray(answer.answer)
          ? answer.answer
          : [answer.answer];
        if (
          selections.some(
            (value) =>
              typeof value !== 'string' || !question.options?.includes(value),
          )
        )
          throw new BadRequestException(
            `Answer is not an allowed option: ${question.id}`,
          );
      }
    }
  }

  private assertOfferValue(input: FundingOfferSubmission): void {
    if (input.amount !== undefined && !/^[1-9][0-9]*$/.test(input.amount))
      throw new BadRequestException(
        'Offer amount must be a positive integer in asset base units',
      );
    if (input.amount !== undefined && !input.asset?.trim())
      throw new BadRequestException('A monetary offer requires an asset');
    if (input.amount === undefined && !input.supportDescription?.trim())
      throw new BadRequestException(
        'An offer requires an amount or in-kind support',
      );
  }

  private async currentSourceVersion(
    manager: EntityManager,
    type: PublicationSourceType,
    sourceId: string,
  ): Promise<number> {
    const row =
      type === PublicationSourceType.Project
        ? await manager.getRepository(ProjectVersionEntity).findOne({
            where: { projectId: sourceId },
            order: { version: 'DESC' },
          })
        : await manager.getRepository(CallVersionEntity).findOne({
            where: { callId: sourceId },
            order: { version: 'DESC' },
          });
    if (!row)
      throw new BadRequestException('Published source version is unavailable');
    return row.version;
  }

  private async assertPublicationReviewer(
    manager: EntityManager,
    source: ProjectEntity | CallEntity,
    reviewerUserId: string,
  ): Promise<void> {
    if (source.ownerUserId === reviewerUserId) return;
    if (!source.ownerOrganizationId)
      throw new ForbiddenException(
        'Only the publication owner can review offers',
      );
    const membership = await manager
      .getRepository(OrganizationMembershipEntity)
      .findOneBy({
        organizationId: source.ownerOrganizationId,
        userId: reviewerUserId,
        status: 'Active',
      });
    if (
      !membership ||
      !['Owner', 'Admin', 'Evaluator'].includes(membership.role)
    )
      throw new ForbiddenException(
        'Reviewer is not authorized for this publication',
      );
  }

  private async assertAcceptedOffersWithinCap(
    manager: EntityManager,
    source: ProjectEntity | CallEntity,
    candidate: FundingOfferEntity,
  ): Promise<void> {
    if (!source.hardCapEnabled || !source.hardCapAmount || !candidate.amount)
      return;
    const repository = manager.getRepository(FundingOfferEntity);
    const accepted = await repository
      .createQueryBuilder('offer')
      .select('COALESCE(SUM(offer.amount), 0)', 'total')
      .where(
        'offer."sourceType" = :sourceType AND offer."sourceId" = :sourceId AND offer."status" = :status AND offer."id" <> :id AND offer."asset" = :asset',
        {
          sourceType: candidate.sourceType,
          sourceId: source.id,
          status: 'Accepted',
          id: candidate.id,
          asset: candidate.asset,
        },
      )
      .getRawOne<{ total: string }>();
    if (
      BigInt(accepted?.total ?? '0') + BigInt(candidate.amount) >
      BigInt(source.hardCapAmount)
    )
      throw new BadRequestException(
        'Accepting this offer would exceed the publication hard cap',
      );
  }
}
