import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AuthSessionGuard,
  CurrentSession,
} from '../identity/auth-session.guard.js';
import type { AuthenticatedSession } from '../identity/auth-session.service.js';
import {
  AIReviewConsentResponseDto,
  AIReviewResponseDto,
  GrantAIReviewConsentDto,
  grantAIReviewConsentSchema,
} from './ai-review.dto.js';
import { AIReviewService } from './ai-review.service.js';

@ApiTags('AI review')
@ApiBearerAuth()
@UseGuards(AuthSessionGuard)
@Controller('applications/:applicationId/ai-review')
export class AIReviewController {
  constructor(private readonly aiReviews: AIReviewService) {}

  @Post('consent')
  @ApiOperation({
    summary: 'Grant consent for advisory AI review processing and retention',
  })
  @ApiBody({
    type: GrantAIReviewConsentDto,
    examples: {
      standardRetention: {
        summary: 'Grant 90-day retention',
        value: { retentionDays: 90 },
      },
    },
  })
  @ApiCreatedResponse({
    description:
      'Consent was recorded for the authenticated application applicant.',
    type: AIReviewConsentResponseDto,
    schema: {
      example: {
        id: 'b53c0dc7-59fc-4bcf-9ca2-7234b968d265',
        policyVersion: 'ai-review-v1',
        grantedAt: '2026-11-14T12:00:00.000Z',
        retentionUntil: '2027-02-12T12:00:00.000Z',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'A valid bearer session is required.',
  })
  async grantConsent(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() body: GrantAIReviewConsentDto,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const parsed = grantAIReviewConsentSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(
        'retentionDays must be an integer between 1 and 365',
      );
    }
    const consent = await this.aiReviews.grantConsent(
      applicationId,
      session.userId,
      parsed.data.retentionDays,
    );
    return {
      id: consent.id,
      policyVersion: consent.policyVersion,
      grantedAt: consent.grantedAt,
      retentionUntil: consent.retentionUntil,
    };
  }

  @Delete('consent')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Withdraw AI review consent and erase its retained review outputs',
  })
  @ApiNoContentResponse({
    description:
      'Consent was withdrawn; associated AI review outputs were erased.',
  })
  @ApiUnauthorizedResponse({
    description: 'A valid bearer session is required.',
  })
  async withdrawConsent(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<void> {
    await this.aiReviews.withdrawConsent(applicationId, session.userId);
  }

  @Get()
  @ApiOperation({
    summary:
      'List retained advisory AI review outputs for the authenticated applicant',
  })
  @ApiOkResponse({
    description:
      'AI outputs are advisory and are not human evaluations or workflow decisions.',
    type: AIReviewResponseDto,
    isArray: true,
    schema: {
      example: [
        {
          id: '2c914d24-a46c-44a9-bdd1-12d85719af34',
          modelProvider: 'openai',
          modelName: 'review-model',
          modelVersion: '2026-10-15',
          promptVersion: 'application-review-v2',
          citedSources: [
            {
              sourceType: 'Answer',
              sourceId: '98d913dc-334c-4d53-87f0-a857ab9ad383',
              fieldPath: 'team.experience',
              documentId: '3b33c29f-e525-4319-9a63-66cf4b62e93b',
            },
          ],
          uncertaintyFlags: [
            'Evidence is self-reported and not independently verified',
          ],
          advisoryOutput: {
            summary: 'The proposal describes an early pilot.',
            observations: ['The timeline is specified in the application.'],
          },
          createdAt: '2026-11-14T12:00:00.000Z',
        },
      ],
    },
  })
  @ApiUnauthorizedResponse({
    description: 'A valid bearer session is required.',
  })
  list(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    return this.aiReviews.listForApplicant(applicationId, session.userId);
  }
}
