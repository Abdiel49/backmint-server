import { BadRequestException, Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthSessionGuard, CurrentSession } from '../identity/auth-session.guard.js';
import type { AuthenticatedSession } from '../identity/auth-session.service.js';
import { CreateMilestoneReviewDto, createMilestoneReviewSchema } from './milestone-reviews.dto.js';
import { MilestoneReviewsService } from './milestone-reviews.service.js';

@ApiTags('Milestones')
@ApiBearerAuth()
@UseGuards(AuthSessionGuard)
@Controller('milestones')
export class MilestoneReviewsController {
  constructor(private readonly reviews: MilestoneReviewsService) {}

  @Post(':milestoneId/reviews')
  @ApiParam({ name: 'milestoneId', format: 'uuid', example: 'e8cf3664-5575-4e06-92a4-c822a873d213' })
  @ApiOperation({ summary: 'Record an assigned reviewer decision for the latest malware-scanned milestone evidence' })
  @ApiBody({
    type: CreateMilestoneReviewDto,
    examples: {
      changesRequested: {
        summary: 'Request a missing supporting record',
        value: {
          evidenceVersion: 2,
          verdict: 'ChangesRequested',
          notes: 'Please include the signed attendance sheet for the second workshop.',
        },
      },
      approved: {
        summary: 'Approve reviewed evidence',
        value: {
          evidenceVersion: 2,
          verdict: 'Approved',
          notes: 'The submitted report and attendance records satisfy the milestone criteria.',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'An immutable decision tied to the exact evidence version and asset checksums.',
    schema: {
      example: {
        id: '29c9a318-d391-45e0-9795-27715e55ee5a',
        milestoneId: 'e8cf3664-5575-4e06-92a4-c822a873d213',
        evidenceVersion: 2,
        reviewerUserId: 'af8f2cf6-5a61-4c48-a624-d3d90b60b229',
        verdict: 'ChangesRequested',
        notes: 'Please include the signed attendance sheet for the second workshop.',
        evidenceHash: 'a'.repeat(64),
        decidedAt: '2026-11-14T13:00:00.000Z',
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'A valid bearer session is required.' })
  @ApiForbiddenResponse({ description: 'Only the assigned reviewer may record a decision.' })
  @ApiNotFoundResponse({ description: 'The milestone or evidence version was not found.' })
  @ApiBadRequestResponse({ description: 'The decision payload is invalid.' })
  @ApiConflictResponse({ description: 'Evidence is stale, unscanned, or the milestone is not awaiting review.' })
  async review(
    @Param('milestoneId', ParseUUIDPipe) milestoneId: string,
    @Body() body: CreateMilestoneReviewDto,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const parsed = createMilestoneReviewSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Milestone review payload is invalid');
    return this.reviews.review({ milestoneId, actorUserId: session.userId, ...parsed.data });
  }
}
