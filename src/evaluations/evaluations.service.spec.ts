import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationEntity } from '../publications/application.entity.js';
import { ProjectEntity } from '../publications/project.entity.js';
import { OrganizationMembershipEntity } from '../organizations/organization-membership.entity.js';
import {
  EvaluationAssignmentEntity,
  EvaluationEntity,
  EvaluationRoundEntity,
} from './evaluation.entity.js';
import { EvaluationsService } from './evaluations.service.js';

describe('EvaluationsService', () => {
  const service = new EvaluationsService({} as never);

  it('requires exactly one submission type for an assignment', async () => {
    await expect(
      service.assign({
        roundId: 'round',
        evaluatorUserId: 'reviewer',
        actorUserId: 'manager',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.assign({
        roundId: 'round',
        evaluatorUserId: 'reviewer',
        actorUserId: 'manager',
        applicationId: 'application',
        fundingOfferId: 'offer',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires a reason for a declared conflict', async () => {
    await expect(
      service.declareConflict('assignment', 'reviewer', true),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates the rubric before accessing persistence', async () => {
    await expect(
      service.createRound({
        sourceType: 'Project',
        sourceId: 'source',
        stage: '',
        rubricVersion: 1,
        rubric: {},
        actorUserId: 'manager',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createRound({
        sourceType: 'Project',
        sourceId: 'source',
        stage: 'Review',
        rubricVersion: 0,
        rubric: { quality: 5 },
        actorUserId: 'manager',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid rubric scores and empty decision notes', async () => {
    const invalidScore = service.submitEvaluation({
      assignmentId: 'assignment',
      evaluatorUserId: 'reviewer',
      findings: {},
      rubricScores: { quality: -1 },
      eligibilityDecision: 'Eligible',
      recommendation: 'Recommend',
      notes: 'Reviewed',
    });
    await expect(invalidScore).rejects.toBeInstanceOf(BadRequestException);
    const emptyNotes = service.submitEvaluation({
      assignmentId: 'assignment',
      evaluatorUserId: 'reviewer',
      findings: {},
      rubricScores: { quality: 4 },
      eligibilityDecision: 'Eligible',
      recommendation: 'Recommend',
      notes: '   ',
    });
    await expect(emptyNotes).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not access storage for invalid request data', async () => {
    const transaction = vi.fn();
    const guarded = new EvaluationsService({ transaction } as never);
    await expect(
      guarded.assign({
        roundId: 'round',
        evaluatorUserId: 'reviewer',
        actorUserId: 'manager',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns only conflict-cleared assignments for an active evaluator', async () => {
    const assignment = {
      id: 'assignment-1',
      evaluatorUserId: 'reviewer-1',
      applicationId: 'application-1',
      fundingOfferId: null,
      roundId: 'round-1',
      conflictStatus: 'NoConflict',
      status: 'InProgress',
    };
    const entities = new Map<unknown, unknown>([
      [
        EvaluationAssignmentEntity,
        {
          find: vi.fn().mockResolvedValue([
            assignment,
            {
              ...assignment,
              id: 'assignment-2',
              conflictStatus: 'Undeclared',
            },
            {
              ...assignment,
              id: 'assignment-3',
              status: 'Revoked',
            },
          ]),
        },
      ],
      [
        EvaluationRoundEntity,
        {
          findOneBy: vi.fn().mockResolvedValue({
            id: 'round-1',
            sourceType: 'Project',
            sourceId: 'source-1',
          }),
        },
      ],
      [
        ProjectEntity,
        {
          findOneBy: vi.fn().mockResolvedValue({
            id: 'source-1',
            ownerOrganizationId: 'organization-1',
          }),
        },
      ],
      [
        OrganizationMembershipEntity,
        {
          findOneBy: vi.fn().mockResolvedValue({
            organizationId: 'organization-1',
            userId: 'reviewer-1',
            role: 'Evaluator',
            status: 'Active',
          }),
        },
      ],
      [
        ApplicationEntity,
        {
          findOneBy: vi.fn().mockResolvedValue({
            id: 'application-1',
            sourceType: 'Project',
            sourceId: 'source-1',
            sourceSnapshot: {},
          }),
        },
      ],
      [EvaluationEntity, { exists: vi.fn().mockResolvedValue(false) }],
    ]);
    const manager = {
      getRepository: (entity: unknown) => entities.get(entity),
    };
    const queueService = new EvaluationsService({
      getRepository: manager.getRepository,
      manager,
    } as never);

    const result = await queueService.reviewerQueue({
      evaluatorUserId: 'reviewer-1',
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.submission).toMatchObject({ id: 'application-1' });
  });
});
