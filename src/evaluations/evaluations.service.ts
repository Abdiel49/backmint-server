import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AuditPersistenceService } from '../audit/audit-persistence.service.js';
import {
  ApplicationAnswerEntity,
  ApplicationEntity,
  FundingOfferEntity,
} from '../publications/application.entity.js';
import { CallEntity } from '../publications/call.entity.js';
import { ProjectEntity } from '../publications/project.entity.js';
import { OrganizationMembershipEntity } from '../organizations/organization-membership.entity.js';
import { OrganizationEntity } from '../organizations/organization.entity.js';
import { UserEntity } from '../identity/user.entity.js';
import { OrganizationRole } from '../domain/authorization/authorization.js';
import type { QuestionnaireQuestion } from '../publications/publication.types.js';
import {
  evaluateEligibility,
  type EligibilityFinding,
  type EligibilityProfile,
} from '../domain/eligibility/eligibility.js';
import {
  EvaluationAssignmentEntity,
  EvaluationEntity,
  EvaluationRoundEntity,
} from './evaluation.entity.js';

type Submission = ApplicationEntity | FundingOfferEntity;

@Injectable()
export class EvaluationsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditPersistenceService,
  ) {}

  async selectApplication(input: {
    applicationId: string;
    actorUserId: string;
  }): Promise<ApplicationEntity> {
    return this.dataSource.transaction(async (manager) => {
      const application = await manager
        .getRepository(ApplicationEntity)
        .findOne({
          where: { id: input.applicationId },
          lock: { mode: 'pessimistic_write' },
        });
      if (!application) throw new NotFoundException('Application not found');
      if (application.status !== 'Shortlisted')
        throw new BadRequestException(
          'Only shortlisted Applications can be selected',
        );
      const sourceEntity =
        application.sourceType === 'Project' ? ProjectEntity : CallEntity;
      const source = await manager.getRepository(sourceEntity).findOne({
        where: { id: application.sourceId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!source)
        throw new NotFoundException('Application publication not found');
      let actingOrganizationId: string | undefined;
      let membershipRole: string | undefined;
      if (source.ownerUserId !== input.actorUserId) {
        if (!source.ownerOrganizationId)
          throw new ForbiddenException('Actor is not the publication owner');
        const membership = await manager
          .getRepository(OrganizationMembershipEntity)
          .findOneBy({
            organizationId: source.ownerOrganizationId,
            userId: input.actorUserId,
            status: 'Active',
          });
        if (
          !membership ||
          (membership.role !== OrganizationRole.Owner &&
            membership.role !== OrganizationRole.Admin)
        )
          throw new ForbiddenException(
            'Actor lacks publication selection permission',
          );
        actingOrganizationId = source.ownerOrganizationId;
        membershipRole = membership.role;
      }
      const humanReviews = await manager.query(
        `SELECT 1
         FROM "evaluation_assignments" assignment
         INNER JOIN "evaluations" evaluation ON evaluation."assignmentId" = assignment."id"
         WHERE assignment."applicationId" = $1
           AND assignment."status" = 'Submitted'
           AND assignment."conflictStatus" = 'NoConflict'
         LIMIT 1`,
        [application.id],
      );
      if (!humanReviews.length)
        throw new BadRequestException(
          'At least one conflict-cleared human evaluation is required before selection',
        );
      application.status = 'Selected';
      const selected = await manager
        .getRepository(ApplicationEntity)
        .save(application);
      await this.audit.appendAuditEvent(manager, {
        action: 'ApplicationSelected',
        outcome: 'Allowed',
        targetType: 'Application',
        targetId: application.id,
        actor: {
          userId: input.actorUserId,
          ...(actingOrganizationId
            ? { organizationId: actingOrganizationId }
            : {}),
          ...(membershipRole ? { membershipRole } : {}),
        },
        correlationId: randomUUID(),
        reasonCode: 'HumanSelection',
      });
      return selected;
    });
  }

  async createRound(input: {
    sourceType: 'Project' | 'Call';
    sourceId: string;
    stage: string;
    rubricVersion: number;
    rubric: Record<string, unknown>;
    actorUserId: string;
  }): Promise<EvaluationRoundEntity> {
    if (
      !input.stage.trim() ||
      !Number.isInteger(input.rubricVersion) ||
      input.rubricVersion < 1 ||
      !Object.keys(input.rubric).length
    )
      throw new BadRequestException(
        'A stage, positive rubric version, and rubric are required',
      );
    return this.dataSource.transaction(async (manager) => {
      await this.assertPublicationManager(
        manager,
        input.sourceType,
        input.sourceId,
        input.actorUserId,
      );
      return manager
        .getRepository(EvaluationRoundEntity)
        .save(
          manager
            .getRepository(EvaluationRoundEntity)
            .create({ ...input, status: 'Open' }),
        );
    });
  }

  async assign(input: {
    roundId: string;
    evaluatorUserId: string;
    applicationId?: string;
    fundingOfferId?: string;
    actorUserId: string;
  }): Promise<EvaluationAssignmentEntity> {
    if (
      (input.applicationId === undefined) ===
      (input.fundingOfferId === undefined)
    )
      throw new BadRequestException(
        'Provide exactly one Application or FundingOffer',
      );
    return this.dataSource.transaction(async (manager) => {
      const round = await this.requireRound(manager, input.roundId);
      await this.assertPublicationManager(
        manager,
        round.sourceType,
        round.sourceId,
        input.actorUserId,
      );
      if (round.status !== 'Open')
        throw new BadRequestException('Evaluation round is closed');
      const submission = await this.loadSubmission(
        manager,
        input.applicationId,
        input.fundingOfferId,
      );
      if (
        submission.sourceType !== round.sourceType ||
        submission.sourceId !== round.sourceId
      )
        throw new BadRequestException(
          'Submission does not belong to this evaluation round',
        );
      await this.assertReviewer(
        manager,
        round.sourceType,
        round.sourceId,
        input.evaluatorUserId,
      );
      if (
        'applicantUserId' in submission &&
        submission.applicantUserId === input.evaluatorUserId
      )
        throw new ForbiddenException(
          'Applicants cannot review their own submission',
        );
      if (
        'funderUserId' in submission &&
        submission.funderUserId === input.evaluatorUserId
      )
        throw new ForbiddenException(
          'Funders cannot review their own submission',
        );
      const applicantOrganizationId =
        'applicantOrganizationId' in submission
          ? submission.applicantOrganizationId
          : submission.funderOrganizationId;
      if (applicantOrganizationId) {
        const applicantMembership = await manager
          .getRepository(OrganizationMembershipEntity)
          .findOneBy({
            organizationId: applicantOrganizationId,
            userId: input.evaluatorUserId,
            status: 'Active',
          });
        if (applicantMembership)
          throw new ForbiddenException(
            'Applicants and their organization members cannot review the submission',
          );
      }
      return manager.getRepository(EvaluationAssignmentEntity).save(
        manager.getRepository(EvaluationAssignmentEntity).create({
          roundId: round.id,
          evaluatorUserId: input.evaluatorUserId,
          applicationId: input.applicationId ?? null,
          fundingOfferId: input.fundingOfferId ?? null,
          conflictStatus: 'Undeclared',
          conflictReason: null,
          conflictDeclaredAt: null,
          status: 'Assigned',
        }),
      );
    });
  }

  async declareConflict(
    assignmentId: string,
    evaluatorUserId: string,
    hasConflict: boolean,
    reason?: string,
  ): Promise<EvaluationAssignmentEntity> {
    if (hasConflict && !reason?.trim())
      throw new BadRequestException(
        'A reason is required when declaring a conflict',
      );
    return this.dataSource.transaction(async (manager) => {
      const assignment = await this.lockAssignment(manager, assignmentId);
      if (assignment.evaluatorUserId !== evaluatorUserId)
        throw new ForbiddenException('Assignment belongs to another reviewer');
      const round = await this.requireRound(manager, assignment.roundId);
      await this.assertReviewer(
        manager,
        round.sourceType,
        round.sourceId,
        evaluatorUserId,
      );
      if (
        assignment.status !== 'Assigned' ||
        assignment.conflictStatus !== 'Undeclared'
      )
        throw new BadRequestException(
          'Conflict declaration is already recorded or assignment is inactive',
        );
      assignment.conflictStatus = hasConflict ? 'Declared' : 'NoConflict';
      assignment.conflictReason = hasConflict ? reason!.trim() : null;
      assignment.conflictDeclaredAt = new Date();
      assignment.status = hasConflict ? 'Conflicted' : 'InProgress';
      return manager.getRepository(EvaluationAssignmentEntity).save(assignment);
    });
  }

  async reviewerQueue(input: {
    evaluatorUserId: string;
    sourceType?: 'Project' | 'Call';
    sourceId?: string;
    status?: string;
    eligibility?: EligibilityFinding;
    reviewed?: boolean;
  }): Promise<
    Array<{
      assignment: EvaluationAssignmentEntity;
      round: EvaluationRoundEntity;
      submission: Submission;
      eligibility?: ReturnType<typeof evaluateEligibility>;
    }>
  > {
    const assignments = await this.dataSource
      .getRepository(EvaluationAssignmentEntity)
      .find({
        where: {
          evaluatorUserId: input.evaluatorUserId,
          status: input.status ?? 'InProgress',
        },
        order: { createdAt: 'ASC' },
      });
    const results = [];
    for (const assignment of assignments) {
      if (assignment.conflictStatus !== 'NoConflict') continue;
      const round = await this.dataSource
        .getRepository(EvaluationRoundEntity)
        .findOneBy({ id: assignment.roundId });
      if (
        !round ||
        (input.sourceType && round.sourceType !== input.sourceType) ||
        (input.sourceId && round.sourceId !== input.sourceId)
      )
        continue;
      await this.assertReviewer(
        this.dataSource.manager,
        round.sourceType,
        round.sourceId,
        input.evaluatorUserId,
      );
      const submission = await this.loadSubmission(
        this.dataSource.manager,
        assignment.applicationId ?? undefined,
        assignment.fundingOfferId ?? undefined,
      );
      const eligibility = await this.computeEligibility(
        this.dataSource.manager,
        submission,
      );
      const reviewed = await this.dataSource
        .getRepository(EvaluationEntity)
        .exists({ where: { assignmentId: assignment.id } });
      if (input.eligibility && eligibility?.result !== input.eligibility)
        continue;
      if (input.reviewed !== undefined && reviewed !== input.reviewed) continue;
      results.push({
        assignment,
        round,
        submission,
        ...(eligibility ? { eligibility } : {}),
      });
    }
    return results;
  }

  async submitEvaluation(input: {
    assignmentId: string;
    evaluatorUserId: string;
    findings: Record<string, unknown>;
    rubricScores: Record<string, number>;
    eligibilityDecision: string;
    recommendation: string;
    notes: string;
  }): Promise<EvaluationEntity> {
    if (
      !['Eligible', 'NeedsReview', 'Ineligible', 'MissingInformation'].includes(
        input.eligibilityDecision,
      )
    ) {
      throw new BadRequestException('Eligibility decision is invalid');
    }
    if (
      ![
        'Recommend',
        'DoNotRecommend',
        'NeedsDiscussion',
        'NoRecommendation',
      ].includes(input.recommendation)
    ) {
      throw new BadRequestException('Recommendation is invalid');
    }
    if (!input.findings || !input.rubricScores || !input.notes.trim())
      throw new BadRequestException(
        'Findings, rubric scores, and notes are required',
      );
    if (
      Object.values(input.rubricScores).some(
        (score) => !Number.isFinite(score) || score < 0,
      )
    )
      throw new BadRequestException(
        'Rubric scores must be non-negative finite numbers',
      );
    return this.dataSource.transaction(async (manager) => {
      const assignment = await this.lockAssignment(manager, input.assignmentId);
      if (assignment.evaluatorUserId !== input.evaluatorUserId)
        throw new ForbiddenException('Assignment belongs to another reviewer');
      const round = await this.requireRound(manager, assignment.roundId);
      await this.assertReviewer(
        manager,
        round.sourceType,
        round.sourceId,
        input.evaluatorUserId,
      );
      if (
        assignment.status !== 'InProgress' ||
        assignment.conflictStatus !== 'NoConflict'
      )
        throw new ForbiddenException(
          'Assignment is not authorized for evaluation',
        );
      if (round.status !== 'Open')
        throw new BadRequestException('Evaluation round is closed');
      const submission = await this.loadSubmission(
        manager,
        assignment.applicationId ?? undefined,
        assignment.fundingOfferId ?? undefined,
      );
      const deterministicEligibility = await this.computeEligibility(
        manager,
        submission,
      );
      const nextVersion =
        (await manager
          .getRepository(EvaluationEntity)
          .countBy({ assignmentId: assignment.id })) + 1;
      const evaluation = await manager.getRepository(EvaluationEntity).save(
        manager.getRepository(EvaluationEntity).create({
          assignmentId: assignment.id,
          version: nextVersion,
          findings: structuredClone(input.findings),
          rubricScores: structuredClone(input.rubricScores),
          eligibilityDecision: input.eligibilityDecision,
          deterministicEligibility: deterministicEligibility ?? null,
          recommendation: input.recommendation,
          notes: input.notes.trim(),
          submittedByUserId: input.evaluatorUserId,
        }),
      );
      assignment.status = 'Submitted';
      await manager.getRepository(EvaluationAssignmentEntity).save(assignment);
      return evaluation;
    });
  }

  private async computeEligibility(
    manager: EntityManager,
    submission: Submission,
  ) {
    const snapshot = submission.sourceSnapshot as Record<string, unknown>;
    const rule = snapshot.eligibilityRule as
      Parameters<typeof evaluateEligibility>[0]['rule'] | undefined;
    if (!rule) return undefined;
    let applicant = (
      'applicantSnapshot' in submission ? submission.applicantSnapshot : {}
    ) as Record<string, unknown>;
    if (
      'funderOrganizationId' in submission &&
      submission.funderOrganizationId
    ) {
      const organization = await manager
        .getRepository(OrganizationEntity)
        .findOneBy({ id: submission.funderOrganizationId, status: 'Active' });
      applicant = organization
        ? {
            type: organization.organizationType,
            country: organization.country,
            legalStatus: organization.legalStatus,
            organizationId: organization.id,
          }
        : {};
    } else if ('funderUserId' in submission && submission.funderUserId) {
      const user = await manager
        .getRepository(UserEntity)
        .findOneBy({ id: submission.funderUserId, status: 'Active' });
      applicant = user ? { type: 'Individual', userId: user.id } : {};
    }
    const answerRows =
      'applicantSnapshot' in submission
        ? await manager
            .getRepository(ApplicationAnswerEntity)
            .findBy({ applicationId: submission.id })
        : undefined;
    const answers: Record<string, unknown> = {};
    if (Array.isArray(answerRows)) {
      for (const answer of answerRows)
        answers[answer.questionKey] = answer.answer;
    }
    const profile: EligibilityProfile = {
      applicantType:
        typeof applicant.type === 'string' ? applicant.type : undefined,
      jurisdiction:
        typeof applicant.country === 'string' ? applicant.country : undefined,
      requirements: {},
    };
    const questions = (
      snapshot.questionnaire as
        { questions?: QuestionnaireQuestion[] } | undefined
    )?.questions;
    const ruleVersion = snapshot.eligibilityRuleVersion;
    return evaluateEligibility({
      rule,
      profile,
      answers,
      questions,
      ruleVersion:
        typeof ruleVersion === 'string' || typeof ruleVersion === 'number'
          ? String(ruleVersion)
          : String(submission.sourceVersion),
    });
  }

  private async loadSubmission(
    manager: EntityManager,
    applicationId?: string,
    fundingOfferId?: string,
  ): Promise<Submission> {
    const submission = applicationId
      ? await manager
          .getRepository(ApplicationEntity)
          .findOneBy({ id: applicationId })
      : await manager
          .getRepository(FundingOfferEntity)
          .findOneBy({ id: fundingOfferId! });
    if (!submission) throw new NotFoundException('Submission was not found');
    return submission;
  }

  private async requireRound(
    manager: EntityManager,
    id: string,
  ): Promise<EvaluationRoundEntity> {
    const round = await manager
      .getRepository(EvaluationRoundEntity)
      .findOneBy({ id });
    if (!round) throw new NotFoundException('Evaluation round was not found');
    return round;
  }

  private async lockAssignment(
    manager: EntityManager,
    id: string,
  ): Promise<EvaluationAssignmentEntity> {
    const rows = await manager
      .getRepository(EvaluationAssignmentEntity)
      .createQueryBuilder('assignment')
      .setLock('pessimistic_write')
      .where('assignment.id = :id', { id })
      .getOne();
    if (!rows)
      throw new NotFoundException('Evaluation assignment was not found');
    return rows;
  }

  private async assertReviewer(
    manager: EntityManager,
    type: string,
    sourceId: string,
    userId: string,
  ): Promise<void> {
    const organizationId = await this.ownerOrganizationId(
      manager,
      type,
      sourceId,
    );
    if (!organizationId)
      throw new ForbiddenException(
        'Publication must have an owning organization for reviewer assignments',
      );
    const membership = await manager
      .getRepository(OrganizationMembershipEntity)
      .findOneBy({ organizationId, userId, status: 'Active' });
    if (
      !membership ||
      (membership.role !== OrganizationRole.Owner &&
        membership.role !== OrganizationRole.Admin &&
        membership.role !== OrganizationRole.Evaluator)
    )
      throw new ForbiddenException('Reviewer lacks evaluation permission');
  }

  private async assertPublicationManager(
    manager: EntityManager,
    type: string,
    sourceId: string,
    userId: string,
  ): Promise<void> {
    const organizationId = await this.ownerOrganizationId(
      manager,
      type,
      sourceId,
    );
    if (!organizationId)
      throw new ForbiddenException('Publication has no owning organization');
    const membership = await manager
      .getRepository(OrganizationMembershipEntity)
      .findOneBy({ organizationId, userId, status: 'Active' });
    if (
      !membership ||
      (membership.role !== OrganizationRole.Owner &&
        membership.role !== OrganizationRole.Admin)
    )
      throw new ForbiddenException(
        'Actor lacks publication evaluation management permission',
      );
  }

  private async ownerOrganizationId(
    manager: EntityManager,
    type: string,
    sourceId: string,
  ): Promise<string | undefined> {
    const entity = type === 'Project' ? ProjectEntity : CallEntity;
    const source = await manager
      .getRepository(entity)
      .findOneBy({ id: sourceId });
    if (!source) throw new NotFoundException('Publication was not found');
    return source.ownerOrganizationId;
  }
}
