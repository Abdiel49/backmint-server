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
  ApiConflictResponse,
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
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  AuthSessionGuard,
  CurrentSession,
} from '../identity/auth-session.guard.js';
import type { AuthenticatedSession } from '../identity/auth-session.service.js';
import { OutcomeClaimsHttpService } from './outcome-claims-http.service.js';
import {
  CreateOutcomeClaimDto,
  ReviewOutcomeClaimDto,
  createOutcomeClaimSchema,
  reviewOutcomeClaimSchema,
} from './outcome-claims.dto.js';

@ApiTags('Outcome claims')
@ApiBearerAuth()
@UseGuards(AuthSessionGuard)
@Controller('organizations/:organizationId/outcome-claims')
export class OutcomeClaimsController {
  constructor(private readonly outcomes: OutcomeClaimsHttpService) {}

  @Post()
  @ApiParam({
    name: 'organizationId',
    format: 'uuid',
    example: '7a93fc29-42a1-4be9-901f-450e261dcd07',
  })
  @ApiOperation({
    summary:
      'Submit a self-reported outcome claim for an organization-owned source',
  })
  @ApiBody({
    type: CreateOutcomeClaimDto,
    examples: {
      solarImpact: {
        summary: 'Report households reached',
        value: {
          sourceType: 'Call',
          sourceId: 'f64f0d7f-d6f1-4c33-b27e-9aefb8b1f11c',
          metricType: 'households_reached',
          value: '1250.5',
          unit: 'people',
          evidenceStorageKey: 'outcomes/solar-call-2026/impact-report.pdf',
          evidenceSha256: 'a'.repeat(64),
        },
      },
    },
  })
  @ApiCreatedResponse({
    description:
      'Claim recorded as SelfReported. Evidence storage keys are never returned.',
    schema: {
      example: {
        id: '5c36f41c-95d4-4cc4-8b4a-dc09187d89d6',
        sourceType: 'Call',
        sourceId: 'f64f0d7f-d6f1-4c33-b27e-9aefb8b1f11c',
        claimedByUserId: 'f2625a81-2af8-4c5b-943a-07c4763fce29',
        metricType: 'households_reached',
        value: '1250.5',
        unit: 'people',
        evidenceSha256: 'a'.repeat(64),
        provenance: 'SelfReported',
        verifierUserId: null,
        verifiedAt: null,
        createdAt: '2026-11-14T12:00:00.000Z',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'A valid bearer session is required.',
    schema: {
      example: {
        statusCode: 401,
        message: 'A valid bearer session is required',
        error: 'Unauthorized',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'The active organization role cannot submit outcome claims.',
    schema: {
      example: {
        statusCode: 403,
        message:
          'Organization membership does not allow this outcome claim action',
        error: 'Forbidden',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Organization or source is unavailable to the caller.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Outcome source was not found',
        error: 'Not Found',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'The claim body contains invalid fields.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Outcome claim payload is invalid',
        error: 'Bad Request',
      },
    },
  })
  async create(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: CreateOutcomeClaimDto,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const parsed = createOutcomeClaimSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('Outcome claim payload is invalid');
    return this.outcomes.create(organizationId, session.userId, parsed.data);
  }

  @Get()
  @ApiParam({
    name: 'organizationId',
    format: 'uuid',
    example: '7a93fc29-42a1-4be9-901f-450e261dcd07',
  })
  @ApiOperation({
    summary: 'List disclosure-safe outcome claims for an organization',
  })
  @ApiQuery({
    name: 'sourceType',
    required: false,
    enum: ['Project', 'Call'],
    example: 'Call',
  })
  @ApiQuery({
    name: 'sourceId',
    required: false,
    format: 'uuid',
    example: 'f64f0d7f-d6f1-4c33-b27e-9aefb8b1f11c',
  })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'offset', required: false, example: 0 })
  @ApiOkResponse({
    description:
      'Only claims attached to sources owned by this organization are returned; private evidence keys and review notes are omitted.',
    schema: {
      example: {
        items: [
          {
            id: '5c36f41c-95d4-4cc4-8b4a-dc09187d89d6',
            sourceType: 'Call',
            sourceId: 'f64f0d7f-d6f1-4c33-b27e-9aefb8b1f11c',
            claimedByUserId: 'f2625a81-2af8-4c5b-943a-07c4763fce29',
            metricType: 'households_reached',
            value: '1250.5',
            unit: 'people',
            evidenceSha256: 'a'.repeat(64),
            provenance: 'SelfReported',
            verifierUserId: null,
            verifiedAt: null,
            createdAt: '2026-11-14T12:00:00.000Z',
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'A valid bearer session is required.',
  })
  @ApiForbiddenResponse({
    description: 'The active organization role cannot view outcome claims.',
  })
  @ApiNotFoundResponse({
    description: 'Organization is unavailable to the caller.',
  })
  @ApiBadRequestResponse({
    description: 'A filter or pagination value is invalid.',
    schema: {
      example: {
        statusCode: 400,
        message: 'limit must be 1-100 and offset must be non-negative',
        error: 'Bad Request',
      },
    },
  })
  async list(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentSession() session: AuthenticatedSession,
    @Query('sourceType') sourceType?: string,
    @Query('sourceId') sourceId?: string,
    @Query('limit') limitValue?: string,
    @Query('offset') offsetValue?: string,
  ) {
    const limit = limitValue === undefined ? 20 : Number(limitValue);
    const offset = offsetValue === undefined ? 0 : Number(offsetValue);
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isSafeInteger(offset) ||
      offset < 0
    ) {
      throw new BadRequestException(
        'limit must be 1-100 and offset must be non-negative',
      );
    }
    if (sourceType !== undefined && !['Project', 'Call'].includes(sourceType))
      throw new BadRequestException('sourceType must be Project or Call');
    if (sourceId !== undefined && !z.uuid().safeParse(sourceId).success)
      throw new BadRequestException('sourceId must be a UUID');
    return this.outcomes.list(organizationId, session.userId, {
      sourceType: sourceType as 'Project' | 'Call' | undefined,
      sourceId,
      limit,
      offset,
    });
  }

  @Post(':claimId/reviews')
  @ApiParam({
    name: 'organizationId',
    format: 'uuid',
    example: '7a93fc29-42a1-4be9-901f-450e261dcd07',
  })
  @ApiParam({
    name: 'claimId',
    format: 'uuid',
    example: '5c36f41c-95d4-4cc4-8b4a-dc09187d89d6',
  })
  @ApiOperation({ summary: 'Review a self-reported claim as Reviewed' })
  @ApiBody({
    type: ReviewOutcomeClaimDto,
    examples: {
      evidenceReviewed: {
        summary: 'Record a human evidence review',
        value: {
          note: 'Reviewed the uploaded monitoring report; the reported count is supported by the cited evidence.',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description:
      'Review was recorded with Reviewed provenance; independent verification is not performed by this endpoint.',
    schema: {
      example: {
        id: '5c36f41c-95d4-4cc4-8b4a-dc09187d89d6',
        sourceType: 'Call',
        sourceId: 'f64f0d7f-d6f1-4c33-b27e-9aefb8b1f11c',
        claimedByUserId: 'f2625a81-2af8-4c5b-943a-07c4763fce29',
        metricType: 'households_reached',
        value: '1250.5',
        unit: 'people',
        evidenceSha256: 'a'.repeat(64),
        provenance: 'Reviewed',
        verifierUserId: '8b0f1835-4c3c-41ec-9f91-f370f59e7614',
        verifiedAt: '2026-11-14T12:00:00.000Z',
        createdAt: '2026-11-14T11:00:00.000Z',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'A valid bearer session is required.',
  })
  @ApiForbiddenResponse({
    description: 'The active organization role cannot review outcome claims.',
  })
  @ApiNotFoundResponse({
    description: 'Claim or its source is unavailable to the caller.',
  })
  @ApiBadRequestResponse({
    description: 'Review note is invalid.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Outcome review payload is invalid',
        error: 'Bad Request',
      },
    },
  })
  @ApiConflictResponse({
    description: 'Claim was already reviewed or the reviewer is the claimant.',
    schema: {
      example: {
        statusCode: 409,
        message: 'Claimants cannot review their own outcome claims',
        error: 'Conflict',
      },
    },
  })
  async review(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('claimId', ParseUUIDPipe) claimId: string,
    @Body() body: ReviewOutcomeClaimDto,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const parsed = reviewOutcomeClaimSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('Outcome review payload is invalid');
    return this.outcomes.review(
      organizationId,
      claimId,
      session.userId,
      parsed.data.note,
      randomUUID(),
    );
  }
}
