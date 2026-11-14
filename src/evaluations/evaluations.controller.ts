import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { z } from 'zod';
import {
  AuthSessionGuard,
  CurrentSession,
} from '../identity/auth-session.guard.js';
import type { AuthenticatedSession } from '../identity/auth-session.service.js';
import { EvaluationsService } from './evaluations.service.js';
import {
  AssignEvaluationDto,
  CreateEvaluationRoundDto,
  DeclareEvaluationConflictDto,
  SubmitEvaluationDto,
  assignEvaluationSchema,
  createEvaluationRoundSchema,
  declareEvaluationConflictSchema,
  submitEvaluationSchema,
} from './evaluations-http.dto.js';

@ApiTags('Human evaluations')
@ApiBearerAuth()
@UseGuards(AuthSessionGuard)
@Controller('evaluations')
export class EvaluationsController {
  constructor(private readonly evaluations: EvaluationsService) {}

  @Post('rounds')
  @ApiOperation({
    summary: 'Create an immutable evaluation round and rubric snapshot',
  })
  @ApiBody({
    type: CreateEvaluationRoundDto,
    examples: {
      initialReview: {
        value: {
          sourceType: 'Call',
          sourceId: 'ca51fe38-0730-44cc-8ae6-2d84f6f6579d',
          stage: 'InitialReview',
          rubricVersion: 1,
          rubric: { impact: { maxScore: 5 }, feasibility: { maxScore: 5 } },
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'Evaluation round created.',
    schema: {
      example: {
        id: '9ed3d8fa-01f4-4dcc-98b0-f63e00c12317',
        sourceType: 'Call',
        sourceId: 'ca51fe38-0730-44cc-8ae6-2d84f6f6579d',
        stage: 'InitialReview',
        rubricVersion: 1,
        rubric: { impact: { maxScore: 5 }, feasibility: { maxScore: 5 } },
        status: 'Open',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid round or rubric.',
    schema: {
      example: {
        statusCode: 400,
        message: 'A stage, positive rubric version, and rubric are required',
        error: 'Bad Request',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Bearer session missing or invalid.',
    schema: {
      example: {
        statusCode: 401,
        message: 'A valid bearer session is required',
        error: 'Unauthorized',
      },
    },
  })
  @ApiForbiddenResponse({
    description:
      'Caller is not an active Owner or Admin of the source organization.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Actor lacks publication evaluation management permission',
        error: 'Forbidden',
      },
    },
  })
  async createRound(
    @Body() body: CreateEvaluationRoundDto,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const parsed = createEvaluationRoundSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('Evaluation round payload is invalid');
    return this.evaluations.createRound({
      ...parsed.data,
      actorUserId: session.userId,
    });
  }

  @Get('rounds')
  @ApiOperation({
    summary: 'List evaluation rounds for a source the caller manages',
  })
  @ApiQuery({ name: 'sourceType', enum: ['Project', 'Call'], example: 'Call' })
  @ApiQuery({
    name: 'sourceId',
    format: 'uuid',
    example: 'ca51fe38-0730-44cc-8ae6-2d84f6f6579d',
  })
  @ApiOkResponse({
    description: 'Rounds scoped to the managed source.',
    schema: {
      example: [
        {
          id: '9ed3d8fa-01f4-4dcc-98b0-f63e00c12317',
          stage: 'InitialReview',
          rubricVersion: 1,
          status: 'Open',
        },
      ],
    },
  })
  @ApiForbiddenResponse({ description: 'Caller does not manage this source.' })
  async listRounds(
    @Query('sourceType') sourceType: string,
    @Query('sourceId', ParseUUIDPipe) sourceId: string,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    if (sourceType !== 'Project' && sourceType !== 'Call')
      throw new BadRequestException('sourceType must be Project or Call');
    return this.evaluations.listRounds({
      sourceType,
      sourceId,
      actorUserId: session.userId,
    });
  }

  @Post('rounds/:roundId/close')
  @ApiParam({
    name: 'roundId',
    format: 'uuid',
    example: '9ed3d8fa-01f4-4dcc-98b0-f63e00c12317',
  })
  @ApiOperation({
    summary: 'Close an evaluation round managed by the caller’s organization',
  })
  @ApiOkResponse({
    description: 'Round closed; new decisions can no longer be submitted.',
    schema: {
      example: { id: '9ed3d8fa-01f4-4dcc-98b0-f63e00c12317', status: 'Closed' },
    },
  })
  @ApiBadRequestResponse({
    description: 'Round is already closed.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Evaluation round is already closed',
        error: 'Bad Request',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Caller does not manage the owning organization.',
  })
  @ApiNotFoundResponse({ description: 'Round was not found.' })
  closeRound(
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    return this.evaluations.closeRound(roundId, session.userId);
  }

  @Post('rounds/:roundId/assignments')
  @ApiParam({
    name: 'roundId',
    format: 'uuid',
    example: '9ed3d8fa-01f4-4dcc-98b0-f63e00c12317',
  })
  @ApiOperation({
    summary:
      'Assign a submission to an active evaluator in the source organization',
  })
  @ApiBody({
    type: AssignEvaluationDto,
    examples: {
      application: {
        value: {
          evaluatorUserId: 'c8c7cb41-a8d7-4fb9-b315-f1b53127840a',
          applicationId: 'f67f060d-9b8a-433e-b755-f5be73824b70',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'Assignment created and awaiting conflict declaration.',
    schema: {
      example: {
        id: '897c50a9-c145-4a63-b847-c5f33d110fb7',
        roundId: '9ed3d8fa-01f4-4dcc-98b0-f63e00c12317',
        evaluatorUserId: 'c8c7cb41-a8d7-4fb9-b315-f1b53127840a',
        applicationId: 'f67f060d-9b8a-433e-b755-f5be73824b70',
        conflictStatus: 'Undeclared',
        status: 'Assigned',
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Submission is not part of the round or request has invalid submission references.',
  })
  @ApiForbiddenResponse({
    description:
      'Caller cannot manage the source or evaluator lacks an active eligible role.',
  })
  @ApiNotFoundResponse({ description: 'Round or submission was not found.' })
  async assign(
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Body() body: AssignEvaluationDto,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const parsed = assignEvaluationSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException(
        'Assignment payload must include one evaluator and exactly one submission',
      );
    return this.evaluations.assign({
      ...parsed.data,
      roundId,
      actorUserId: session.userId,
    });
  }

  @Get('rounds/:roundId/assignments')
  @ApiParam({
    name: 'roundId',
    format: 'uuid',
    example: '9ed3d8fa-01f4-4dcc-98b0-f63e00c12317',
  })
  @ApiOperation({
    summary: 'List assignments for a round managed by the caller',
  })
  @ApiOkResponse({
    description: 'Assignments scoped to the owning organization.',
    schema: {
      example: [
        {
          id: '897c50a9-c145-4a63-b847-c5f33d110fb7',
          evaluatorUserId: 'c8c7cb41-a8d7-4fb9-b315-f1b53127840a',
          conflictStatus: 'NoConflict',
          status: 'InProgress',
        },
      ],
    },
  })
  @ApiForbiddenResponse({
    description: 'Caller does not manage the owning organization.',
  })
  @ApiNotFoundResponse({ description: 'Round was not found.' })
  listAssignments(
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    return this.evaluations.listRoundAssignments(roundId, session.userId);
  }

  @Post('assignments/:assignmentId/revoke')
  @ApiParam({
    name: 'assignmentId',
    format: 'uuid',
    example: '897c50a9-c145-4a63-b847-c5f33d110fb7',
  })
  @ApiOperation({
    summary: 'Revoke an unsubmitted assignment as an organization manager',
  })
  @ApiOkResponse({
    description: 'Assignment revoked.',
    schema: {
      example: {
        id: '897c50a9-c145-4a63-b847-c5f33d110fb7',
        status: 'Revoked',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'A submitted or already revoked assignment cannot be revoked.',
  })
  @ApiForbiddenResponse({
    description: 'Caller does not manage the owning organization.',
  })
  @ApiNotFoundResponse({ description: 'Assignment was not found.' })
  revokeAssignment(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    return this.evaluations.revokeAssignment(assignmentId, session.userId);
  }

  @Get('queue')
  @ApiOperation({
    summary:
      'List only the authenticated evaluator’s conflict-cleared assignments',
  })
  @ApiQuery({ name: 'sourceType', required: false, enum: ['Project', 'Call'] })
  @ApiQuery({ name: 'sourceId', required: false, format: 'uuid' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['InProgress', 'Submitted'],
  })
  @ApiQuery({
    name: 'eligibility',
    required: false,
    enum: ['Eligible', 'NeedsReview', 'Ineligible', 'MissingInformation'],
  })
  @ApiQuery({ name: 'reviewed', required: false, type: Boolean })
  @ApiOkResponse({
    description:
      'Assigned submissions with deterministic eligibility findings when available. AI review remains advisory.',
    schema: {
      example: [
        {
          assignment: {
            id: '897c50a9-c145-4a63-b847-c5f33d110fb7',
            conflictStatus: 'NoConflict',
            status: 'InProgress',
          },
          round: {
            id: '9ed3d8fa-01f4-4dcc-98b0-f63e00c12317',
            stage: 'InitialReview',
          },
          submission: { id: 'f67f060d-9b8a-433e-b755-f5be73824b70' },
          eligibility: {
            result: 'NeedsReview',
            ruleVersion: 'call-v3',
            findings: [],
          },
        },
      ],
    },
  })
  async queue(
    @Query() query: Record<string, string>,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const parsed = z
      .strictObject({
        sourceType: z.enum(['Project', 'Call']).optional(),
        sourceId: z.uuid().optional(),
        status: z.enum(['InProgress', 'Submitted']).optional(),
        eligibility: z
          .enum(['Eligible', 'NeedsReview', 'Ineligible', 'MissingInformation'])
          .optional(),
        reviewed: z
          .enum(['true', 'false'])
          .transform((value) => value === 'true')
          .optional(),
      })
      .safeParse(query);
    if (!parsed.success)
      throw new BadRequestException('Evaluation queue filters are invalid');
    return this.evaluations.reviewerQueue({
      ...parsed.data,
      evaluatorUserId: session.userId,
    });
  }

  @Post('assignments/:assignmentId/conflict')
  @ApiParam({
    name: 'assignmentId',
    format: 'uuid',
    example: '897c50a9-c145-4a63-b847-c5f33d110fb7',
  })
  @ApiOperation({
    summary:
      'Record the assigned evaluator’s one-time conflict declaration before review',
  })
  @ApiBody({
    type: DeclareEvaluationConflictDto,
    examples: {
      clear: { value: { hasConflict: false } },
      conflict: {
        value: {
          hasConflict: true,
          reason: 'I have a current financial relationship with the applicant.',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Conflict declaration recorded.',
    schema: {
      example: {
        id: '897c50a9-c145-4a63-b847-c5f33d110fb7',
        conflictStatus: 'NoConflict',
        status: 'InProgress',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Declaration is invalid or already recorded.',
  })
  @ApiForbiddenResponse({
    description:
      'Assignment belongs to another user or evaluator is no longer active.',
  })
  @ApiNotFoundResponse({ description: 'Assignment was not found.' })
  async declareConflict(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() body: DeclareEvaluationConflictDto,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const parsed = declareEvaluationConflictSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('Conflict declaration payload is invalid');
    return this.evaluations.declareConflict(
      assignmentId,
      session.userId,
      parsed.data.hasConflict,
      parsed.data.reason,
    );
  }

  @Post('assignments/:assignmentId/evaluation')
  @ApiParam({
    name: 'assignmentId',
    format: 'uuid',
    example: '897c50a9-c145-4a63-b847-c5f33d110fb7',
  })
  @ApiOperation({
    summary:
      'Submit an immutable human decision for a conflict-cleared assignment',
  })
  @ApiBody({
    type: SubmitEvaluationDto,
    examples: {
      humanDecision: {
        value: {
          findings: {
            strengths: ['Clear delivery plan'],
            risks: ['Adoption estimate is unverified'],
          },
          rubricScores: { impact: 4, feasibility: 3 },
          eligibilityDecision: 'Eligible',
          recommendation: 'Recommend',
          notes:
            'The proposal meets the published eligibility rules and provides a credible delivery plan.',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description:
      'Human evaluation recorded as immutable history; deterministic eligibility is stored separately.',
    schema: {
      example: {
        id: 'aa2b8668-dd9b-46a4-935e-a4f78af0eb96',
        assignmentId: '897c50a9-c145-4a63-b847-c5f33d110fb7',
        version: 1,
        eligibilityDecision: 'Eligible',
        deterministicEligibility: {
          result: 'Eligible',
          ruleVersion: 'call-v3',
          findings: [],
        },
        recommendation: 'Recommend',
        notes:
          'The proposal meets the published eligibility rules and provides a credible delivery plan.',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Evaluation payload is invalid or the round is closed.',
  })
  @ApiForbiddenResponse({
    description:
      'Assignment is not owned by the authenticated evaluator or is not conflict-cleared.',
  })
  @ApiNotFoundResponse({ description: 'Assignment was not found.' })
  async submitEvaluation(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() body: SubmitEvaluationDto,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const parsed = submitEvaluationSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('Evaluation payload is invalid');
    return this.evaluations.submitEvaluation({
      ...parsed.data,
      assignmentId,
      evaluatorUserId: session.userId,
    });
  }
}
