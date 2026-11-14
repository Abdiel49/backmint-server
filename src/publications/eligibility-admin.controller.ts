import {
  BadRequestException,
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Put,
  StandardSchemaValidationPipe,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AuthSessionGuard,
  CurrentSession,
} from '../identity/auth-session.guard.js';
import type { AuthenticatedSession } from '../identity/auth-session.service.js';
import { EligibilityAdminService } from './eligibility-admin.service.js';
import {
  eligibilityConfigurationSchema,
  parsePublicationSourceType,
  type EligibilityConfigurationDto,
} from './eligibility-admin.dto.js';

@ApiTags('Eligibility and questionnaires')
@ApiBearerAuth()
@UseGuards(AuthSessionGuard)
@UsePipes(new StandardSchemaValidationPipe())
@Controller('publications/:sourceType/:sourceId/eligibility')
export class EligibilityAdminController {
  constructor(private readonly eligibility: EligibilityAdminService) {}

  @Put()
  @ApiOperation({
    summary:
      'Configure eligibility rules, questionnaire, and opportunity policy for an owned draft',
  })
  @ApiParam({ name: 'sourceType', enum: ['Project', 'Call'], example: 'Call' })
  @ApiParam({
    name: 'sourceId',
    format: 'uuid',
    example: '8d128d3a-51ca-49e2-b1a3-b08bec885c21',
  })
  @ApiBody({
    schema: { type: 'object' },
    examples: {
      realisticCall: {
        summary: 'Community grant application rules',
        value: {
          eligibilityRule: {
            audienceTypes: ['Nonprofit', 'Community'],
            allowedJurisdictions: ['US', 'BO'],
            excludedJurisdictions: ['CU'],
            verificationLevel: 'Enhanced',
            minRequirements: { operatingYears: 2 },
          },
          questionnaire: {
            questions: [
              {
                id: 'impact-plan',
                kind: 'LongText',
                label: 'Describe the expected community impact',
                required: true,
                displayOrder: 0,
              },
              {
                id: 'delivery-region',
                kind: 'SingleChoice',
                label: 'Where will the work happen?',
                required: true,
                options: ['La Paz', 'Santa Cruz'],
                displayOrder: 1,
              },
            ],
          },
          opportunityPolicy: {
            maxApplicationsPerApplicant: 1,
            maxAwards: 4,
            selectionWindowOpensAt: '2026-12-01T00:00:00.000Z',
            selectionWindowClosesAt: '2027-01-15T23:59:59.000Z',
            allowReapply: false,
          },
        },
      },
    },
  })
  @ApiOkResponse({
    schema: {
      example: {
        sourceType: 'Call',
        sourceId: '8d128d3a-51ca-49e2-b1a3-b08bec885c21',
        eligibilityRuleVersion: 2,
        questionnaireVersion: 3,
        configuration: {
          eligibilityRule: { audienceTypes: ['Nonprofit'] },
          questionnaire: { questions: [] },
          opportunityPolicy: { maxAwards: 4 },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'The payload is invalid or the source is already published',
    schema: {
      example: {
        statusCode: 400,
        message:
          'Eligibility and questionnaire versions are immutable after publication',
        error: 'Bad Request',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Bearer session is missing or inactive',
  })
  @ApiForbiddenResponse({
    description:
      'The user is not the source owner or an active owner, admin, or project manager',
  })
  @ApiNotFoundResponse({ description: 'Publication source does not exist' })
  configure(
    @Param('sourceType') sourceTypeParam: string,
    @Param('sourceId', new ParseUUIDPipe({ version: '4' })) sourceId: string,
    @CurrentSession() session: AuthenticatedSession,
    @Body({ schema: eligibilityConfigurationSchema })
    body: EligibilityConfigurationDto,
  ) {
    let sourceType;
    try {
      sourceType = parsePublicationSourceType(sourceTypeParam);
    } catch {
      throw new BadRequestException('Invalid publication source type');
    }
    return this.eligibility.configure(
      sourceType,
      sourceId,
      session.userId,
      body,
    );
  }
}
