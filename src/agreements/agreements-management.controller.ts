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
import { AgreementVersionEntity } from './agreement.entity.js';
import {
  agreementVersionInputSchema,
  AgreementVersionInputDto,
} from './agreements-management.dto.js';
import { AgreementsService } from './agreements.service.js';

const agreementExample = {
  id: 'a38f9153-4d27-4d3a-bc21-40f67691b8ef',
  awardId: '7cba108d-9a33-4c86-b7c8-726dc1536152',
  status: 'Draft',
  currentVersion: 1,
};

@ApiTags('Agreements')
@ApiBearerAuth()
@UseGuards(AuthSessionGuard)
@Controller()
export class AgreementsManagementController {
  constructor(private readonly agreements: AgreementsService) {}

  @Post('awards/:awardId/agreements')
  @ApiParam({
    name: 'awardId',
    format: 'uuid',
    example: agreementExample.awardId,
  })
  @ApiOperation({
    summary: 'Create an Agreement from an accepted Award',
    description:
      'Creates the Award’s single Agreement in Draft with immutable version 1. Agreement terms are validated against the accepted Award allocation and parties.',
  })
  @ApiBody({ type: AgreementVersionInputDto })
  @ApiCreatedResponse({
    description: 'Agreement created.',
    schema: { example: agreementExample },
  })
  @ApiBadRequestResponse({
    description: 'Terms or deadline are invalid.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Agreement network and asset are required',
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
    description: 'The caller must have active authority for a required Funder or Recipient party.',
    schema: { example: { statusCode: 403, message: 'Active authority for a required Funder or Recipient party is required', error: 'Forbidden' } },
  })
  @ApiNotFoundResponse({
    description: 'Award does not exist.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Award was not found',
        error: 'Not Found',
      },
    },
  })
  @ApiConflictResponse({
    description: 'Award is not accepted or already has an Agreement.',
    schema: {
      example: {
        statusCode: 409,
        message: 'Award must be accepted before agreement creation',
        error: 'Conflict',
      },
    },
  })
  async createFromAward(
    @Param('awardId', ParseUUIDPipe) awardId: string,
    @Body({ schema: agreementVersionInputSchema })
    body: z.infer<typeof agreementVersionInputSchema>,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const agreement = await this.agreements.createFromAward(
      awardId,
      session.userId,
      this.toServiceInput(body),
    );
    return {
      id: agreement.id,
      awardId: agreement.awardId,
      status: agreement.status,
      currentVersion: agreement.currentVersion,
    };
  }

  @Post('agreements/:agreementId/versions')
  @ApiParam({
    name: 'agreementId',
    format: 'uuid',
    example: agreementExample.id,
  })
  @ApiOperation({
    summary: 'Create a new immutable Agreement version',
    description:
      'Creates the next immutable terms version while the Agreement is Draft or PendingAcceptance. This resets its status to Draft, making prior signatures stale.',
  })
  @ApiBody({ type: AgreementVersionInputDto })
  @ApiCreatedResponse({
    description: 'Immutable version created.',
    schema: {
      example: {
        agreementId: agreementExample.id,
        version: 2,
        terms: {
          network: 'near:testnet',
          asset: 'NEAR',
          parties: [
            { key: 'recipient-org', role: 'Recipient', required: true },
          ],
          milestones: [
            { sequence: 1, allocationBaseUnits: '1000000000000000000000000', acceptanceCriteria: { deliverable: 'Commissioned solar installation' }, reviewerUserId: 'a621a439-b8ae-450e-9e08-94f635a61dce', dueAt: '2027-06-01T12:00:00.000Z' },
          ],
          verificationAuthority: { type: 'funder-review' },
          deadlines: { completion: '2027-06-30T23:59:59.000Z' },
          cancellationPolicy: { permitted: true },
          disputePolicy: { process: 'mediation' },
          refundPolicy: { unspentFunds: 'return-to-funder' },
          legalTerms: { governingLaw: 'Bolivia' },
          economicTerms: { allocationBaseUnits: '1000000000000000000000000' },
        },
        termsHash:
          'db5b3c2c859e239a50e8a9443b2e1b8cf662b48f9012c08b60e8a3a8c99f45c1',
        economicTermsHash:
          '08e5fba3d3f5e987e9c56514c7a96ac68f690c51ca379d1426076db2b4951ad8',
        acceptanceExpiresAt: '2027-01-15T18:00:00.000Z',
        contractArtifactReference: 'backmint-contracts:escrow-v1',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Terms or deadline are invalid.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Agreement version input is invalid',
        error: 'Bad Request',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'A valid bearer session is required.',
  })
  @ApiForbiddenResponse({
    description: 'The caller must have active authority for a required Funder or Recipient party.',
    schema: { example: { statusCode: 403, message: 'Active authority for a required Funder or Recipient party is required', error: 'Forbidden' } },
  })
  @ApiNotFoundResponse({ description: 'Agreement does not exist.' })
  @ApiConflictResponse({
    description: 'Agreement is no longer amendable.',
    schema: {
      example: {
        statusCode: 409,
        message: 'Agreement terms can no longer be amended',
        error: 'Conflict',
      },
    },
  })
  async createVersion(
    @Param('agreementId', ParseUUIDPipe) agreementId: string,
    @Body({ schema: agreementVersionInputSchema })
    body: z.infer<typeof agreementVersionInputSchema>,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const version = await this.agreements.createVersion(
      agreementId,
      session.userId,
      this.toServiceInput(body),
    );
    return this.toVersionResponse(version);
  }

  @Post('agreements/:agreementId/submissions')
  @ApiParam({
    name: 'agreementId',
    format: 'uuid',
    example: agreementExample.id,
  })
  @ApiOperation({
    summary: 'Submit the current Agreement version for signatures',
    description:
      'Moves the current Draft version to PendingAcceptance. Each milestone must specify a consecutive sequence, positive allocationBaseUnits, nonempty acceptanceCriteria and reviewerUserId. The economic terms require allocationBaseUnits. The parties sign this exact immutable version.',
  })
  @ApiOkResponse({
    description: 'Current version is pending party signatures.',
    schema: {
      example: {
        id: agreementExample.id,
        awardId: agreementExample.awardId,
        status: 'PendingAcceptance',
        currentVersion: 2,
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'A valid bearer session is required.',
  })
  @ApiForbiddenResponse({
    description: 'The caller must have active authority for a required Funder or Recipient party.',
    schema: { example: { statusCode: 403, message: 'Active authority for a required Funder or Recipient party is required', error: 'Forbidden' } },
  })
  @ApiNotFoundResponse({ description: 'Agreement does not exist.' })
  @ApiBadRequestResponse({
    description: 'The milestone schedule or Agreement allocation is invalid.',
    schema: { example: { statusCode: 400, message: 'Milestone allocations cannot exceed the Agreement allocation', error: 'Bad Request' } },
  })
  @ApiConflictResponse({
    description:
      'Agreement cannot be submitted or its acceptance deadline has passed.',
    schema: {
      example: {
        statusCode: 409,
        message: 'Agreement acceptance deadline has passed',
        error: 'Conflict',
      },
    },
  })
  async submitForAcceptance(
    @Param('agreementId', ParseUUIDPipe) agreementId: string,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const agreement = await this.agreements.submitForAcceptance(
      agreementId,
      session.userId,
    );
    return {
      id: agreement.id,
      awardId: agreement.awardId,
      status: agreement.status,
      currentVersion: agreement.currentVersion,
    };
  }

  private toServiceInput(body: z.infer<typeof agreementVersionInputSchema>) {
    return {
      terms: body.terms,
      acceptanceExpiresAt: new Date(body.acceptanceExpiresAt),
      contractArtifactReference: body.contractArtifactReference,
    };
  }

  private toVersionResponse(version: AgreementVersionEntity) {
    return {
      agreementId: version.agreementId,
      version: version.version,
      terms: version.terms,
      termsHash: version.termsHash,
      economicTermsHash: version.economicTermsHash,
      acceptanceExpiresAt: version.acceptanceExpiresAt,
      contractArtifactReference: version.contractArtifactReference,
    };
  }
}
