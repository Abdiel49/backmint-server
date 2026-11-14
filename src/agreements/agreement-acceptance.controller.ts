import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { z } from 'zod';
import {
  AuthSessionGuard,
  CurrentSession,
} from '../identity/auth-session.guard.js';
import type { AuthenticatedSession } from '../identity/auth-session.service.js';
import { AgreementsService } from './agreements.service.js';

const agreementAcceptanceSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/i),
  partyKey: z.string().min(1).max(80),
});

@ApiTags('Agreements')
@ApiBearerAuth()
@UseGuards(AuthSessionGuard)
@Controller('agreements')
export class AgreementAcceptanceController {
  constructor(private readonly agreements: AgreementsService) {}

  @Post(':agreementId/acceptances')
  @ApiParam({
    name: 'agreementId',
    format: 'uuid',
    example: 'a38f9153-4d27-4d3a-bc21-40f67691b8ef',
  })
  @ApiOperation({
    summary:
      'Record the authenticated party acceptance of the current agreement version',
    description:
      'The service checks the exact current version and terms hash, acceptance deadline, named user or active verified representative authority, and required-party completion. This endpoint records consent under the authenticated session; cryptographic wallet signature capture is not yet available.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['expectedVersion', 'expectedHash', 'partyKey'],
      properties: {
        expectedVersion: { type: 'integer', minimum: 1, example: 2 },
        expectedHash: {
          type: 'string',
          pattern: '^[a-f0-9]{64}$',
          example:
            'db5b3c2c859e239a50e8a9443b2e1b8cf662b48f9012c08b60e8a3a8c99f45c1',
        },
        partyKey: { type: 'string', maxLength: 80, example: 'recipient-org' },
      },
    },
    examples: {
      acceptCurrentVersion: {
        summary: 'Accept the current recipient party terms',
        value: {
          expectedVersion: 2,
          expectedHash:
            'db5b3c2c859e239a50e8a9443b2e1b8cf662b48f9012c08b60e8a3a8c99f45c1',
          partyKey: 'recipient-org',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'The party acceptance was recorded.',
    schema: {
      example: {
        agreementId: 'a38f9153-4d27-4d3a-bc21-40f67691b8ef',
        status: 'PendingAcceptance',
        currentVersion: 2,
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'The request body is invalid.',
    schema: {
      example: {
        statusCode: 400,
        message: ['expectedVersion must be a positive integer'],
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
  @ApiForbiddenResponse({
    description: 'The caller is not authorized to accept for this party.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Active representative authority is required',
        error: 'Forbidden',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Agreement does not exist.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Agreement was not found',
        error: 'Not Found',
      },
    },
  })
  @ApiConflictResponse({
    description:
      'The agreement is not accepting, the version/hash is stale, the deadline passed, or the party has already accepted.',
    schema: {
      example: {
        statusCode: 409,
        message: 'Acceptance references a stale agreement version',
        error: 'Conflict',
      },
    },
  })
  async accept(
    @Param('agreementId', ParseUUIDPipe) agreementId: string,
    @Body({ schema: agreementAcceptanceSchema })
    body: z.infer<typeof agreementAcceptanceSchema>,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const agreement = await this.agreements.accept(
      agreementId,
      session.userId,
      body.expectedVersion,
      body.expectedHash,
      body.partyKey,
    );
    return {
      agreementId: agreement.id,
      status: agreement.status,
      currentVersion: agreement.currentVersion,
    };
  }
}
