import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AuthSessionGuard,
  CurrentSession,
} from '../identity/auth-session.guard.js';
import type { AuthenticatedSession } from '../identity/auth-session.service.js';
import { AwardsService } from './awards.service.js';
import {
  AwardRecipientResponseDto,
  AwardListQueryDto,
  CreateAwardFromApplicationDto,
  CreateAwardFromFundingOfferDto,
  awardRecipientResponseSchema,
  awardListQuerySchema,
  createAwardFromApplicationSchema,
  createAwardFromFundingOfferSchema,
} from './awards.dto.js';

const awardResponseExample = {
  id: '7cba108d-9a33-4c86-b7c8-726dc1536152',
  sourceType: 'Call',
  sourceId: 'f64f0d7f-d6f1-4c33-b27e-9aefb8b1f11c',
  applicationId: 'cc5af074-b339-444a-9d09-c7b165427021',
  fundingOfferId: null,
  allocation: '250000000000000000000000',
  asset: 'NEAR',
  state: 'Offered',
  expiresAt: '2027-01-15T18:00:00.000Z',
  acceptedAt: null,
  releasedAt: null,
  terms: {
    purpose: 'Install solar equipment for the approved rural clinic project',
    reportingDeadline: '2027-03-31',
  },
};

const awardConflictExample = {
  statusCode: 409,
  message: 'Application must be selected for award',
  error: 'Conflict',
};

@ApiTags('Awards')
@ApiBearerAuth()
@UseGuards(AuthSessionGuard)
@Controller('awards')
export class AwardsController {
  constructor(private readonly awards: AwardsService) {}

  @Get()
  @ApiOperation({
    summary: 'List Awards visible to the authenticated user',
    description:
      'Returns Awards where the user is the named individual recipient, an active Owner/Admin of the recipient organization, the individual source publisher, or an active Owner/Admin of the source publisher organization. Results use a safe projection without ownership identifiers or immutable source snapshots.',
  })
  @ApiQuery({ name: 'limit', required: false, example: 20, minimum: 1, maximum: 100 })
  @ApiQuery({ name: 'offset', required: false, example: 0, minimum: 0, maximum: 100000 })
  @ApiOkResponse({
    description: 'A page of Awards visible to the authenticated user.',
    schema: {
      example: {
        items: [awardResponseExample],
        total: 1,
        limit: 20,
        offset: 0,
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Pagination values are outside the allowed range.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Award list query is invalid',
        error: 'Bad Request',
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
  async list(
    @Query() query: AwardListQueryDto,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const parsed = awardListQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new BadRequestException('Award list query is invalid');
    const result = await this.awards.listVisible(session.userId, parsed.data);
    return { ...result, items: result.items.map((award) => this.toResponse(award)) };
  }

  @Get(':awardId')
  @ApiParam({
    name: 'awardId',
    format: 'uuid',
    example: '7cba108d-9a33-4c86-b7c8-726dc1536152',
  })
  @ApiOperation({
    summary: 'Get an Award visible to the authenticated user',
    description:
      'Returns an Award only to its named individual recipient, an active Owner/Admin of the recipient organization, the individual source publisher, or an active Owner/Admin of the source publisher organization. Unavailable and unauthorized Awards both return 404.',
  })
  @ApiOkResponse({
    description:
      'Safe Award projection. The Award state does not represent a deposit or payment.',
    schema: { example: awardResponseExample },
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
  @ApiNotFoundResponse({
    description: 'The Award is missing or unavailable to this user.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Award not found',
        error: 'Not Found',
      },
    },
  })
  async get(
    @Param('awardId', ParseUUIDPipe) awardId: string,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    return this.toResponse(
      await this.awards.getVisible(awardId, session.userId),
    );
  }

  @Post('applications/:applicationId')
  @ApiParam({
    name: 'applicationId',
    format: 'uuid',
    example: 'cc5af074-b339-444a-9d09-c7b165427021',
  })
  @ApiOperation({
    summary: 'Create an Award from a selected Application',
    description:
      'The authenticated publisher must own the source. The Application must be Selected. Creating this Award reserves source capacity but does not represent a deposit or payment.',
  })
  @ApiBody({
    type: CreateAwardFromApplicationDto,
    examples: {
      solarClinic: {
        summary: 'Offer a NEAR allocation to a selected clinic application',
        value: {
          allocation: '250000000000000000000000',
          asset: 'NEAR',
          expiresAt: '2027-01-15T18:00:00.000Z',
          terms: {
            purpose:
              'Install solar equipment for the approved rural clinic project',
            reportingDeadline: '2027-03-31',
          },
        },
      },
    },
  })
  @ApiCreatedResponse({
    description:
      'Award offer created and capacity reserved. The response explicitly reports that no deposit has been made.',
    schema: { example: awardResponseExample },
  })
  @ApiBadRequestResponse({
    description: 'The payload is invalid or the expiry is not in the future.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Award payload is invalid',
        error: 'Bad Request',
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
  @ApiNotFoundResponse({
    description: 'The Application or its source was not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Application not found',
        error: 'Not Found',
      },
    },
  })
  @ApiConflictResponse({
    description:
      'The caller does not own the source, the Application is not selected, or reservation capacity is exhausted.',
    schema: { example: awardConflictExample },
  })
  async createFromApplication(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() body: CreateAwardFromApplicationDto,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const parsed = createAwardFromApplicationSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('Award payload is invalid');
    return this.toResponse(
      await this.awards.createFromApplication({
        applicationId,
        allocation: parsed.data.allocation,
        asset: parsed.data.asset,
        expiresAt: new Date(parsed.data.expiresAt),
        actorUserId: session.userId,
        terms: parsed.data.terms,
      }),
    );
  }

  @Post('funding-offers/:fundingOfferId')
  @ApiParam({
    name: 'fundingOfferId',
    format: 'uuid',
    example: '373b6349-73a8-481e-9f18-32d9948fb79d',
  })
  @ApiOperation({
    summary: 'Create an Award from an accepted FundingOffer',
    description:
      'The authenticated publisher must own the source. The FundingOffer must be Accepted and contain a monetary amount. Creating this Award reserves source capacity but does not represent a deposit or payment.',
  })
  @ApiBody({
    type: CreateAwardFromFundingOfferDto,
    examples: {
      acceptedCommunityOffer: {
        summary: 'Set an expiry and terms for an accepted community offer',
        value: {
          expiresAt: '2027-01-15T18:00:00.000Z',
          terms: {
            purpose: 'Fund the community water testing program',
            reportingDeadline: '2027-03-31',
          },
        },
      },
    },
  })
  @ApiCreatedResponse({
    description:
      'Award offer created from the accepted FundingOffer and capacity reserved; no deposit is implied.',
    schema: {
      example: {
        ...awardResponseExample,
        applicationId: null,
        fundingOfferId: '373b6349-73a8-481e-9f18-32d9948fb79d',
        allocation: '500000000000000000000000',
        terms: {
          purpose: 'Fund the community water testing program',
          reportingDeadline: '2027-03-31',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'The payload is invalid or the expiry is not in the future.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Award payload is invalid',
        error: 'Bad Request',
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
  @ApiNotFoundResponse({
    description: 'The FundingOffer or its source was not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'FundingOffer not found',
        error: 'Not Found',
      },
    },
  })
  @ApiConflictResponse({
    description:
      'The caller does not own the source, the offer is not accepted, or reservation capacity is exhausted.',
    schema: {
      example: {
        statusCode: 409,
        message: 'FundingOffer must be accepted for award',
        error: 'Conflict',
      },
    },
  })
  async createFromFundingOffer(
    @Param('fundingOfferId', ParseUUIDPipe) fundingOfferId: string,
    @Body() body: CreateAwardFromFundingOfferDto,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const parsed = createAwardFromFundingOfferSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('Award payload is invalid');
    return this.toResponse(
      await this.awards.createFromFundingOffer({
        fundingOfferId,
        expiresAt: new Date(parsed.data.expiresAt),
        actorUserId: session.userId,
        terms: parsed.data.terms,
      }),
    );
  }

  @Post(':awardId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiParam({
    name: 'awardId',
    format: 'uuid',
    example: '7cba108d-9a33-4c86-b7c8-726dc1536152',
  })
  @ApiOperation({
    summary: 'Accept an Award as its recipient',
    description:
      'The authenticated user is the actor. Organization recipients must provide their organization ID as context; the service verifies active Owner/Admin membership. Acceptance does not mean that funds were deposited.',
  })
  @ApiBody({
    type: AwardRecipientResponseDto,
    examples: {
      organizationRecipient: {
        summary: 'Accept in an organization capacity',
        value: {
          recipientOrganizationId:
            '7a93fc29-42a1-4be9-901f-450e261dcd07',
        },
      },
      individualRecipient: {
        summary: 'Accept as an individual recipient',
        value: { recipientOrganizationId: null },
      },
    },
  })
  @ApiOkResponse({
    description: 'Award accepted; no deposit or payment is implied.',
    schema: {
      example: {
        ...awardResponseExample,
        state: 'Accepted',
        acceptedAt: '2026-11-14T12:30:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'The recipient context body is invalid.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Award recipient response payload is invalid',
        error: 'Bad Request',
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
  @ApiNotFoundResponse({
    description: 'The Award was not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Award not found',
        error: 'Not Found',
      },
    },
  })
  @ApiConflictResponse({
    description:
      'The caller is not the recipient, organization membership is insufficient, the Award is no longer Offered, or it has expired.',
    schema: {
      example: {
        statusCode: 409,
        message: 'Only the award recipient can respond',
        error: 'Conflict',
      },
    },
  })
  async accept(
    @Param('awardId', ParseUUIDPipe) awardId: string,
    @Body() body: AwardRecipientResponseDto,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const parsed = awardRecipientResponseSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException(
        'Award recipient response payload is invalid',
      );
    return this.toResponse(
      await this.awards.accept(
        awardId,
        session.userId,
        parsed.data.recipientOrganizationId ?? undefined,
      ),
    );
  }

  @Post(':awardId/decline')
  @HttpCode(HttpStatus.OK)
  @ApiParam({
    name: 'awardId',
    format: 'uuid',
    example: '7cba108d-9a33-4c86-b7c8-726dc1536152',
  })
  @ApiOperation({
    summary: 'Decline an Award as its recipient',
    description:
      'The authenticated user is the actor. Organization recipients must provide their organization ID as context; the service verifies active Owner/Admin membership. Declining releases the reservation and never records a deposit.',
  })
  @ApiBody({
    type: AwardRecipientResponseDto,
    examples: {
      organizationRecipient: {
        summary: 'Decline in an organization capacity',
        value: {
          recipientOrganizationId:
            '7a93fc29-42a1-4be9-901f-450e261dcd07',
        },
      },
      individualRecipient: {
        summary: 'Decline as an individual recipient',
        value: { recipientOrganizationId: null },
      },
    },
  })
  @ApiOkResponse({
    description: 'Award declined and reservation released; no deposit recorded.',
    schema: {
      example: {
        ...awardResponseExample,
        state: 'Declined',
        releasedAt: '2026-11-14T12:30:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'The recipient context body is invalid.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Award recipient response payload is invalid',
        error: 'Bad Request',
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
  @ApiNotFoundResponse({
    description: 'The Award was not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Award not found',
        error: 'Not Found',
      },
    },
  })
  @ApiConflictResponse({
    description:
      'The caller is not the recipient, organization membership is insufficient, the Award is no longer Offered, or it has expired.',
    schema: {
      example: {
        statusCode: 409,
        message: 'Only the award recipient can respond',
        error: 'Conflict',
      },
    },
  })
  async decline(
    @Param('awardId', ParseUUIDPipe) awardId: string,
    @Body() body: AwardRecipientResponseDto,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const parsed = awardRecipientResponseSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException(
        'Award recipient response payload is invalid',
      );
    return this.toResponse(
      await this.awards.decline(
        awardId,
        session.userId,
        parsed.data.recipientOrganizationId ?? undefined,
      ),
    );
  }

  private toResponse(award: Awaited<ReturnType<AwardsService['accept']>>) {
    return {
      id: award.id,
      sourceType: award.sourceType,
      sourceId: award.sourceId,
      applicationId: award.applicationId,
      fundingOfferId: award.fundingOfferId,
      allocation: award.allocation,
      asset: award.asset,
      state: award.state,
      expiresAt: award.expiresAt,
      acceptedAt: award.acceptedAt,
      releasedAt: award.releasedAt,
      terms:
        typeof award.termsSnapshot.terms === 'object' &&
        award.termsSnapshot.terms !== null
          ? award.termsSnapshot.terms
          : {},
    };
  }
}
