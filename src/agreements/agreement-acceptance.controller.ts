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
  ApiCreatedResponse,
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
import {
  AgreementAcceptanceChallengeDto,
  AgreementAcceptanceChallengeResponseDto,
  agreementAcceptanceChallengeSchema,
  agreementAcceptanceSchema,
} from './agreement-acceptance.dto.js';
import { AgreementsService } from './agreements.service.js';

@ApiTags('Agreements')
@ApiBearerAuth()
@UseGuards(AuthSessionGuard)
@Controller('agreements')
export class AgreementAcceptanceController {
  constructor(private readonly agreements: AgreementsService) {}

  @Post(':agreementId/acceptances/challenges')
  @ApiParam({
    name: 'agreementId',
    format: 'uuid',
    example: 'a38f9153-4d27-4d3a-bc21-40f67691b8ef',
  })
  @ApiOperation({
    summary: 'Issue a one-time NEP-413 agreement acceptance challenge',
    description:
      'The challenge binds the exact current agreement version and terms hash, party key, authenticated user, active linked wallet, network, recipient, and expiration.',
  })
  @ApiBody({
    type: AgreementAcceptanceChallengeDto,
    examples: {
      currentTerms: {
        value: {
          expectedVersion: 2,
          expectedHash:
            'db5b3c2c859e239a50e8a9443b2e1b8cf662b48f9012c08b60e8a3a8c99f45c1',
          partyKey: 'recipient-org',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'A short-lived NEP-413 acceptance challenge was issued.',
    type: AgreementAcceptanceChallengeResponseDto,
    schema: {
      example: {
        id: '1d76e1ac-dba2-46b0-8496-a13328682d2b',
        message:
          '{"type":"backmint.agreement.acceptance","challengeId":"1d76e1ac-dba2-46b0-8496-a13328682d2b","agreementId":"a38f9153-4d27-4d3a-bc21-40f67691b8ef","version":2,"termsHash":"db5b3c2c859e239a50e8a9443b2e1b8cf662b48f9012c08b60e8a3a8c99f45c1","partyKey":"recipient-org","userId":"f2625a81-2af8-4c5b-943a-07c4763fce29","walletLinkId":"1ed85f24-fbe3-4a2b-8570-85571d64b76f","accountId":"alice.testnet","publicKey":"ed25519:11111111111111111111111111111111","network":"near:testnet","agreementNetwork":"near:testnet","recipient":"backmint-server","expiresAt":"2026-11-14T12:05:00.000Z"}',
        nonce: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=',
        accountId: 'alice.testnet',
        publicKey: 'ed25519:11111111111111111111111111111111',
        network: 'near:testnet',
        recipient: 'backmint-server',
        expiresAt: '2026-11-14T12:05:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({ description: 'The challenge request is invalid.' })
  @ApiUnauthorizedResponse({ description: 'A valid bearer session is required.' })
  @ApiForbiddenResponse({
    description:
      'The caller is not authorized for this party or has no active linked wallet.',
  })
  @ApiNotFoundResponse({ description: 'Agreement does not exist.' })
  @ApiConflictResponse({
    description:
      'The agreement is not accepting, the requested version/hash is stale, the deadline passed, or wallet network does not match.',
  })
  async issueAcceptanceChallenge(
    @Param('agreementId', ParseUUIDPipe) agreementId: string,
    @Body({ schema: agreementAcceptanceChallengeSchema })
    body: z.infer<typeof agreementAcceptanceChallengeSchema>,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    return this.agreements.issueAcceptanceChallenge(
      agreementId,
      session.userId,
      body.expectedVersion,
      body.expectedHash,
      body.partyKey,
    );
  }

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
      'Verifies a one-time NEP-413 signature bound to the current version and authorized party. The final required acceptance atomically creates the operational milestones from the signed terms.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: [
        'expectedVersion',
        'expectedHash',
        'partyKey',
        'challengeId',
        'nonce',
        'signature',
      ],
      properties: {
        expectedVersion: { type: 'integer', minimum: 1, example: 2 },
        expectedHash: {
          type: 'string',
          pattern: '^[a-f0-9]{64}$',
          example:
            'db5b3c2c859e239a50e8a9443b2e1b8cf662b48f9012c08b60e8a3a8c99f45c1',
        },
        partyKey: { type: 'string', maxLength: 80, example: 'recipient-org' },
        challengeId: {
          type: 'string',
          format: 'uuid',
          example: '1d76e1ac-dba2-46b0-8496-a13328682d2b',
        },
        nonce: {
          type: 'string',
          example: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=',
        },
        signature: {
          type: 'string',
          example: `${'A'.repeat(86)}==`,
          description: 'Base64-encoded 64-byte Ed25519 NEP-413 signature.',
        },
      },
    },
    examples: {
      signedAcceptance: {
        summary: 'Accept using a signed one-time wallet challenge',
        value: {
          expectedVersion: 2,
          expectedHash:
            'db5b3c2c859e239a50e8a9443b2e1b8cf662b48f9012c08b60e8a3a8c99f45c1',
          partyKey: 'recipient-org',
          challengeId: '1d76e1ac-dba2-46b0-8496-a13328682d2b',
          nonce: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=',
          signature: `${'A'.repeat(86)}==`,
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
    description: 'The request body or signed milestone schedule is invalid, or the assigned reviewer is inactive.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Milestone reviewer must be an active user',
        error: 'Bad Request',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description:
      'The session, challenge, nonce, signature, or linked wallet is invalid.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Agreement acceptance signature is invalid',
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
      'The agreement is not accepting, the version/hash is stale, the deadline passed, the party has already accepted, or operational milestones already exist.',
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
      body.challengeId,
      body.nonce,
      body.signature,
    );
    return {
      agreementId: agreement.id,
      status: agreement.status,
      currentVersion: agreement.currentVersion,
    };
  }
}
