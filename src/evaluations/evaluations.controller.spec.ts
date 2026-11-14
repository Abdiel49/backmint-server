import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedSession } from '../identity/auth-session.service.js';
import { EvaluationsService } from './evaluations.service.js';
import { EvaluationsController } from './evaluations.controller.js';

describe('EvaluationsController', () => {
  const listRounds = vi.fn();
  const reviewerQueue = vi.fn();
  const declareConflict = vi.fn();
  const createRound = vi.fn();
  const service = {
    createRound,
    listRounds,
    assign: vi.fn(),
    listRoundAssignments: vi.fn(),
    closeRound: vi.fn(),
    revokeAssignment: vi.fn(),
    reviewerQueue,
    declareConflict,
    submitEvaluation: vi.fn(),
  } as unknown as EvaluationsService;
  const controller = new EvaluationsController(service);
  const session = { userId: 'authenticated-user' } as AuthenticatedSession;

  it('takes the round manager identity from the session', async () => {
    listRounds.mockResolvedValue([]);
    await controller.listRounds(
      'Call',
      'ca51fe38-0730-44cc-8ae6-2d84f6f6579d',
      session,
    );
    expect(listRounds).toHaveBeenCalledWith({
      sourceType: 'Call',
      sourceId: 'ca51fe38-0730-44cc-8ae6-2d84f6f6579d',
      actorUserId: 'authenticated-user',
    });
  });

  it('takes evaluator identity from the session for queue and decisions', async () => {
    reviewerQueue.mockResolvedValue([]);
    await controller.queue({ reviewed: 'false' }, session);
    expect(reviewerQueue).toHaveBeenCalledWith({
      reviewed: false,
      evaluatorUserId: 'authenticated-user',
    });

    declareConflict.mockResolvedValue({} as never);
    await controller.declareConflict(
      '897c50a9-c145-4a63-b847-c5f33d110fb7',
      { hasConflict: false },
      session,
    );
    expect(declareConflict).toHaveBeenCalledWith(
      '897c50a9-c145-4a63-b847-c5f33d110fb7',
      'authenticated-user',
      false,
      undefined,
    );
  });

  it('rejects malformed strict payloads before invoking services', async () => {
    await expect(
      controller.createRound(
        {
          sourceType: 'Call',
          sourceId: 'ca51fe38-0730-44cc-8ae6-2d84f6f6579d',
          stage: 'InitialReview',
          rubricVersion: 1,
          rubric: { impact: { maxScore: 5 } },
          actorUserId: 'forged-user',
        } as never,
        session,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createRound).not.toHaveBeenCalled();
  });
});
