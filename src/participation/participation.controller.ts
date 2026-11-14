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
  ApiQuery,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AuthSessionGuard,
  CurrentSession,
} from '../identity/auth-session.guard.js';
import type { AuthenticatedSession } from '../identity/auth-session.service.js';
import {
  RateLimitPolicy,
  UseRateLimit,
} from '../infrastructure/rate-limit/rate-limit.decorator.js';
import {
  submitApplicationSchema,
  submitFundingOfferSchema,
  submissionPageSchema,
  SubmitApplicationDto,
  SubmitFundingOfferDto,
} from './participation.dto.js';
import { ParticipationHttpService } from './participation-http.service.js';

@ApiTags('Participation')
@ApiBearerAuth()
@UseGuards(AuthSessionGuard)
@Controller()
export class ParticipationController {
  constructor(private readonly participation: ParticipationHttpService) {}

  @Post('applications')
  @UseRateLimit(RateLimitPolicy.Financial)
  @ApiOperation({
    summary: 'Submit an Application to a FundingOffered Project or Call',
  })
  @ApiBody({
    type: SubmitApplicationDto,
    examples: {
      individual: {
        value: {
          sourceType: 'Call',
          sourceId: 'f64f0d7f-d6f1-4c33-b27e-9aefb8b1f11c',
          proposal: {
            title: 'Solar training program',
            summary: 'A community-led pilot.',
          },
          answers: [
            {
              questionKey: 'team_experience',
              answer: 'Five years of community energy work.',
            },
          ],
        },
      },
      organization: {
        value: {
          sourceType: 'Project',
          sourceId: '8ab31b75-c38c-4be2-a68f-d74c95ee72ae',
          applicantOrganizationId: 'cb3662f4-d5b7-4ee8-9cf7-858a81a847a7',
          proposal: { title: 'Rural microgrid', summary: 'A 12-site pilot.' },
          answers: [],
        },
      },
      withAttachment: {
        value: {
          sourceType: 'Project',
          sourceId: '8ab31b75-c38c-4be2-a68f-d74c95ee72ae',
          applicantOrganizationId: 'cb3662f4-d5b7-4ee8-9cf7-858a81a847a7',
          proposal: { title: 'Rural microgrid' },
          answers: [{ questionKey: 'project_plan', answer: 'See attached plan', attachmentIds: ['4e38df44-63d1-467a-90d4-bde6bce3e6db'] }],
        },
      },
    },
  })
  @ApiCreatedResponse({
    description:
      'Application submitted with immutable snapshots; Applications with attachments remain PendingFileScan.',
    schema: {
      example: {
        id: '71d94885-9e19-4827-bdbb-3de3d5333e3b',
        sourceType: 'Call',
        sourceId: 'f64f0d7f-d6f1-4c33-b27e-9aefb8b1f11c',
        status: 'Submitted',
        receipt: 'fc9e8f67-8b29-42ba-839c-a853df480b0b',
        submittedAt: '2026-11-14T12:00:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Malformed request, unavailable or duplicate attachment, or invalid source direction.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Application attachment is unavailable',
        error: 'Bad Request',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'A valid Bearer session is required.',
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
      'The caller lacks an active, suitable organization membership or fails eligibility.',
    schema: {
      example: {
        statusCode: 403,
        message:
          'An active organization membership with an authorized role is required',
        error: 'Forbidden',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'The source does not exist or is private.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Publication not found',
        error: 'Not Found',
      },
    },
  })
  @ApiTooManyRequestsResponse({
    description: 'The financial submission rate limit was exceeded.',
  })
  async submitApplication(
    @Body() body: unknown,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const parsed = submitApplicationSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException(
        parsed.error.issues.map((issue) => issue.message),
      );
    return this.participation.submitApplication(session.userId, parsed.data);
  }

  @Get('applications')
  @ApiQuery({
    name: 'limit',
    required: false,
    minimum: 1,
    maximum: 100,
    example: 20,
  })
  @ApiQuery({ name: 'offset', required: false, minimum: 0, example: 0 })
  @ApiOperation({
    summary:
      'List Applications submitted by the authenticated user or active participating organizations',
  })
  @ApiOkResponse({
    description:
      'Only Applications owned by the caller or an organization they can represent are returned.',
    schema: {
      example: {
        items: [
          {
            id: '71d94885-9e19-4827-bdbb-3de3d5333e3b',
            sourceType: 'Call',
            sourceId: 'f64f0d7f-d6f1-4c33-b27e-9aefb8b1f11c',
            status: 'Submitted',
            receipt: 'fc9e8f67-8b29-42ba-839c-a853df480b0b',
            answers: [],
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'A valid Bearer session is required.',
  })
  async listApplications(
    @Query() query: unknown,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const page = submissionPageSchema.safeParse(query);
    if (!page.success)
      throw new BadRequestException(
        'limit must be 1-100 and offset must be non-negative',
      );
    return this.participation.listApplications(session.userId, page.data);
  }

  @Post('funding-offers')
  @UseRateLimit(RateLimitPolicy.Financial)
  @ApiOperation({
    summary: 'Submit a FundingOffer to a FundingRequested Project or Call',
  })
  @ApiBody({
    type: SubmitFundingOfferDto,
    examples: {
      monetary: {
        value: {
          sourceType: 'Project',
          sourceId: '8ab31b75-c38c-4be2-a68f-d74c95ee72ae',
          amount: '2500000000000000000000000',
          asset: 'NEAR',
          restrictedPurpose: 'Community solar equipment only.',
          conditions: { reporting: 'Quarterly impact report' },
        },
      },
      organization: {
        value: {
          sourceType: 'Call',
          sourceId: 'f64f0d7f-d6f1-4c33-b27e-9aefb8b1f11c',
          funderOrganizationId: 'cb3662f4-d5b7-4ee8-9cf7-858a81a847a7',
          supportDescription: 'Provide 40 solar panels and installation.',
          supportType: 'Equipment',
          conditions: { deliveryWindow: '90 days' },
        },
      },
    },
  })
  @ApiCreatedResponse({
    description:
      'FundingOffer submitted; submission is not a deposit or a funded Award.',
    schema: {
      example: {
        id: 'e7b15140-2f20-45b3-8fb0-25da8d681574',
        sourceType: 'Project',
        sourceId: '8ab31b75-c38c-4be2-a68f-d74c95ee72ae',
        amount: '2500000000000000000000000',
        asset: 'NEAR',
        status: 'Submitted',
        receipt: 'bb6f6e0a-e643-4695-81b1-644ef53d86d8',
        submittedAt: '2026-11-14T12:00:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Malformed request or source has the wrong direction.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Submission direction does not match source',
        error: 'Bad Request',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'A valid Bearer session is required.',
  })
  @ApiForbiddenResponse({
    description:
      'The caller lacks an active, suitable organization membership or fails eligibility.',
  })
  @ApiNotFoundResponse({
    description: 'The source does not exist or is private.',
  })
  @ApiTooManyRequestsResponse({
    description: 'The financial submission rate limit was exceeded.',
  })
  async submitFundingOffer(
    @Body() body: unknown,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const parsed = submitFundingOfferSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException(
        parsed.error.issues.map((issue) => issue.message),
      );
    return this.participation.submitFundingOffer(session.userId, parsed.data);
  }

  @Get('funding-offers')
  @ApiQuery({
    name: 'limit',
    required: false,
    minimum: 1,
    maximum: 100,
    example: 20,
  })
  @ApiQuery({ name: 'offset', required: false, minimum: 0, example: 0 })
  @ApiOperation({
    summary:
      'List FundingOffers submitted by the authenticated user or active participating organizations',
  })
  @ApiOkResponse({
    description:
      'Only offers owned by the caller or an organization they can represent are returned.',
    schema: {
      example: {
        items: [
          {
            id: 'e7b15140-2f20-45b3-8fb0-25da8d681574',
            sourceType: 'Project',
            sourceId: '8ab31b75-c38c-4be2-a68f-d74c95ee72ae',
            amount: '2500000000000000000000000',
            asset: 'NEAR',
            status: 'Submitted',
            receipt: 'bb6f6e0a-e643-4695-81b1-644ef53d86d8',
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'A valid Bearer session is required.',
  })
  async listFundingOffers(
    @Query() query: unknown,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const page = submissionPageSchema.safeParse(query);
    if (!page.success)
      throw new BadRequestException(
        'limit must be 1-100 and offset must be non-negative',
      );
    return this.participation.listFundingOffers(session.userId, page.data);
  }

  @Post('funding-offers/:offerId/review')
  @UseRateLimit(RateLimitPolicy.Financial)
  @ApiOperation({ summary: 'Move a FundingOffer into source-owner review' })
  @ApiOkResponse({
    description: 'Offer moved to review.',
    schema: {
      example: {
        id: 'e7b15140-2f20-45b3-8fb0-25da8d681574',
        status: 'UnderReview',
        reviewedAt: '2026-11-14T13:00:00.000Z',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'A valid Bearer session is required.',
  })
  @ApiForbiddenResponse({
    description:
      'Caller is not the source owner or an active Owner, Admin, or Evaluator.',
  })
  @ApiNotFoundResponse({ description: 'FundingOffer was not found.' })
  @ApiBadRequestResponse({ description: 'The offer is no longer reviewable.' })
  @ApiTooManyRequestsResponse({
    description: 'The financial review rate limit was exceeded.',
  })
  reviewFundingOffer(
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    return this.participation.reviewFundingOffer(
      session.userId,
      offerId,
      'UnderReview',
    );
  }

  @Post('funding-offers/:offerId/accept')
  @UseRateLimit(RateLimitPolicy.Financial)
  @ApiOperation({ summary: 'Accept a FundingOffer as the source owner' })
  @ApiOkResponse({
    description:
      'Offer accepted subject to hard-cap and intake checks; this does not mark funds as deposited.',
    schema: {
      example: {
        id: 'e7b15140-2f20-45b3-8fb0-25da8d681574',
        status: 'Accepted',
        reviewedAt: '2026-11-14T13:00:00.000Z',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'A valid Bearer session is required.',
  })
  @ApiForbiddenResponse({
    description:
      'Caller is not the source owner or an active Owner, Admin, or Evaluator.',
  })
  @ApiNotFoundResponse({ description: 'FundingOffer was not found.' })
  @ApiBadRequestResponse({
    description:
      'The offer is no longer reviewable, intake is closed, or acceptance exceeds the source hard cap.',
  })
  @ApiTooManyRequestsResponse({
    description: 'The financial review rate limit was exceeded.',
  })
  acceptFundingOffer(
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    return this.participation.reviewFundingOffer(
      session.userId,
      offerId,
      'Accepted',
    );
  }

  @Post('funding-offers/:offerId/decline')
  @UseRateLimit(RateLimitPolicy.Financial)
  @ApiOperation({ summary: 'Decline a FundingOffer as the source owner' })
  @ApiOkResponse({
    description: 'Offer declined.',
    schema: {
      example: {
        id: 'e7b15140-2f20-45b3-8fb0-25da8d681574',
        status: 'Declined',
        reviewedAt: '2026-11-14T13:00:00.000Z',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'A valid Bearer session is required.',
  })
  @ApiForbiddenResponse({
    description:
      'Caller is not the source owner or an active Owner, Admin, or Evaluator.',
  })
  @ApiNotFoundResponse({ description: 'FundingOffer was not found.' })
  @ApiBadRequestResponse({ description: 'The offer is no longer reviewable.' })
  @ApiTooManyRequestsResponse({
    description: 'The financial review rate limit was exceeded.',
  })
  declineFundingOffer(
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    return this.participation.reviewFundingOffer(
      session.userId,
      offerId,
      'Declined',
    );
  }
}
