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
  ApiTags,
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
import { VerificationService } from './verification.service.js';
import {
  verificationDecisionSchema,
  verificationRevocationSchema,
  verificationUploadSchema,
  VerificationDecisionRequestDto,
  VerificationRevocationRequestDto,
  VerificationUploadRequestDto,
} from './verification.dto.js';

@ApiTags('Organization verification')
@ApiBearerAuth()
@UseGuards(AuthSessionGuard)
@Controller()
export class VerificationController {
  constructor(private readonly verifications: VerificationService) {}

  @Post('organizations/:organizationId/verification')
  @ApiParam({
    name: 'organizationId',
    format: 'uuid',
    example: 'd5f4c3b2-a190-4e87-9c6d-5b4a3f2e1d0c',
  })
  @ApiOperation({
    summary:
      'Create or retrieve the authenticated organization verification case',
  })
  @ApiCreatedResponse({
    description: 'The organization verification case is available.',
    schema: {
      example: {
        id: 'a7913c27-3479-4d99-916c-ff27a2c31a80',
        organizationId: 'd5f4c3b2-a190-4e87-9c6d-5b4a3f2e1d0c',
        status: 'NotStarted',
        stateVersion: 1,
        documents: [],
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'A valid bearer session is required.',
  })
  @ApiNotFoundResponse({
    description: 'The organization is unavailable to this caller.',
  })
  async createCase(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const result = await this.verifications.createCase(
      session.userId,
      organizationId,
    );
    return this.presentCase(result);
  }

  @Get('verification-cases/:caseId')
  @ApiParam({
    name: 'caseId',
    format: 'uuid',
    example: 'a7913c27-3479-4d99-916c-ff27a2c31a80',
  })
  @ApiOperation({
    summary: 'Read a private verification case and its evidence metadata',
  })
  @ApiOkResponse({
    description:
      'Private case status and evidence metadata; storage keys are never returned.',
    schema: {
      example: {
        id: 'a7913c27-3479-4d99-916c-ff27a2c31a80',
        organizationId: 'd5f4c3b2-a190-4e87-9c6d-5b4a3f2e1d0c',
        status: 'Pending',
        stateVersion: 2,
        expiresAt: null,
        documents: [
          {
            id: '6aa74230-82f6-49c7-a756-ea974802aab3',
            fileName: 'registration-certificate.pdf',
            contentType: 'application/pdf',
            contentLength: 182440,
            checksumSha256: '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
            createdAt: '2026-11-14T12:00:00.000Z',
          },
        ],
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'A valid bearer session is required.',
  })
  @ApiNotFoundResponse({
    description: 'The private verification case was not found.',
  })
  async getCase(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    return this.presentCase(
      await this.verifications.getCase(session.userId, caseId),
    );
  }

  @Post('verification-cases/:caseId/documents/upload-url')
  @UseRateLimit(RateLimitPolicy.Upload)
  @ApiParam({
    name: 'caseId',
    format: 'uuid',
    example: 'a7913c27-3479-4d99-916c-ff27a2c31a80',
  })
  @ApiOperation({
    summary: 'Create a private, scoped URL for uploading verification evidence',
  })
  @ApiBody({
    type: VerificationUploadRequestDto,
    examples: {
      registrationDocument: {
        summary: 'PDF evidence with SHA-256 checksum',
        value: {
          fileName: 'registration-certificate.pdf',
          contentType: 'application/pdf',
          contentLength: 182440,
          checksumSha256: '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description:
      'A short-lived private upload URL. Internal storage keys are not returned.',
    schema: {
      example: {
        url: 'https://storage.example.test/private-upload?signature=temporary',
        expiresAt: '2026-11-14T12:15:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'The file metadata or checksum is invalid.',
  })
  @ApiConflictResponse({
    description: 'Evidence cannot be changed in the current case state.',
  })
  @ApiUnauthorizedResponse({
    description: 'A valid bearer session is required.',
  })
  @ApiNotFoundResponse({
    description: 'The private verification case was not found.',
  })
  async createUploadUrl(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() body: VerificationUploadRequestDto,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const parsed = verificationUploadSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('Verification file metadata is invalid');
    const upload = await this.verifications.createDocumentUpload(
      session.userId,
      caseId,
      parsed.data,
    );
    return { url: upload.url, expiresAt: upload.expiresAt };
  }

  @Post('verification-cases/:caseId/submit')
  @HttpCode(HttpStatus.OK)
  @ApiParam({
    name: 'caseId',
    format: 'uuid',
    example: 'a7913c27-3479-4d99-916c-ff27a2c31a80',
  })
  @ApiOperation({
    summary: 'Submit an organization verification case for review',
  })
  @ApiOkResponse({
    description: 'The case entered the review queue.',
    schema: {
      example: {
        id: 'a7913c27-3479-4d99-916c-ff27a2c31a80',
        status: 'Pending',
        stateVersion: 2,
      },
    },
  })
  @ApiConflictResponse({
    description: 'The case is not editable or has no evidence metadata.',
  })
  @ApiUnauthorizedResponse({
    description: 'A valid bearer session is required.',
  })
  @ApiNotFoundResponse({
    description: 'The private verification case was not found.',
  })
  async submit(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    return this.presentCase(
      await this.verifications.submit(session.userId, caseId),
    );
  }

  @Post('verification-cases/:caseId/reviews')
  @HttpCode(HttpStatus.OK)
  @ApiParam({
    name: 'caseId',
    format: 'uuid',
    example: 'a7913c27-3479-4d99-916c-ff27a2c31a80',
  })
  @ApiOperation({
    summary:
      'Record an authorized reviewer decision for a pending verification case',
  })
  @ApiBody({
    type: VerificationDecisionRequestDto,
    examples: {
      requestMoreInformation: {
        summary: 'Request additional evidence',
        value: {
          decision: 'NeedsInfo',
          reason: 'Please provide a current registration certificate.',
        },
      },
      verified: {
        summary: 'Verify with expiry',
        value: {
          decision: 'Verified',
          reason:
            'The submitted registration details match the reviewed source.',
          expiresAt: '2027-11-14T12:00:00.000Z',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'The reviewer decision was recorded.',
    schema: {
      example: {
        id: 'a7913c27-3479-4d99-916c-ff27a2c31a80',
        status: 'Verified',
        stateVersion: 3,
        expiresAt: '2027-11-14T12:00:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({ description: 'The decision or expiry is invalid.' })
  @ApiConflictResponse({
    description:
      'The case is not awaiting review or the reviewer submitted the case.',
  })
  @ApiUnauthorizedResponse({
    description: 'A valid bearer session is required.',
  })
  @ApiNotFoundResponse({
    description: 'The private verification case was not found.',
  })
  async decide(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() body: VerificationDecisionRequestDto,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const parsed = verificationDecisionSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('Verification review decision is invalid');
    return this.presentCase(
      await this.verifications.decide(
        session.userId,
        caseId,
        parsed.data.decision,
        parsed.data.reason,
        parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
      ),
    );
  }

  @Post('verification-cases/:caseId/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiParam({
    name: 'caseId',
    format: 'uuid',
    example: 'a7913c27-3479-4d99-916c-ff27a2c31a80',
  })
  @ApiOperation({
    summary: 'Revoke a pending or verified organization verification case',
  })
  @ApiBody({
    type: VerificationRevocationRequestDto,
    examples: {
      supersededEvidence: {
        value: {
          reason:
            'The submitted evidence was superseded by a corrected filing.',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'The case was revoked.',
    schema: {
      example: {
        id: 'a7913c27-3479-4d99-916c-ff27a2c31a80',
        status: 'Revoked',
        stateVersion: 4,
        revokedAt: '2026-11-14T12:00:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({ description: 'A revocation reason is required.' })
  @ApiConflictResponse({
    description: 'The case cannot be revoked in its current state.',
  })
  @ApiUnauthorizedResponse({
    description: 'A valid bearer session is required.',
  })
  @ApiNotFoundResponse({
    description: 'The private verification case was not found.',
  })
  async revoke(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() body: VerificationRevocationRequestDto,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const parsed = verificationRevocationSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('A revocation reason is required');
    return this.presentCase(
      await this.verifications.revoke(
        session.userId,
        caseId,
        parsed.data.reason,
      ),
    );
  }

  @Post('verification-cases/:caseId/documents/:documentId/download-url')
  @HttpCode(HttpStatus.OK)
  @ApiParam({
    name: 'caseId',
    format: 'uuid',
    example: 'a7913c27-3479-4d99-916c-ff27a2c31a80',
  })
  @ApiParam({
    name: 'documentId',
    format: 'uuid',
    example: '6aa74230-82f6-49c7-a756-ea974802aab3',
  })
  @ApiOperation({
    summary:
      'Create a short-lived download URL for private verification evidence',
  })
  @ApiOkResponse({
    description:
      'A short-lived download URL is returned to an authorized private reader. Internal storage keys are not returned.',
    schema: {
      example: {
        url: 'https://storage.example.test/private-download?signature=temporary',
        expiresAt: '2026-11-14T12:15:00.000Z',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'A valid bearer session is required.',
  })
  @ApiNotFoundResponse({
    description: 'The private verification evidence was not found.',
  })
  async createDownloadUrl(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const download = await this.verifications.createDocumentDownload(
      session.userId,
      caseId,
      documentId,
    );
    return { url: download.url, expiresAt: download.expiresAt };
  }

  private presentCase(
    verificationCase: Awaited<ReturnType<VerificationService['getCase']>>,
  ) {
    return {
      id: verificationCase.id,
      organizationId: verificationCase.organizationId,
      status: verificationCase.status,
      stateVersion: verificationCase.stateVersion,
      expiresAt: verificationCase.expiresAt,
      revokedAt: verificationCase.revokedAt,
      documents: (verificationCase.documents ?? []).map((document) => ({
        id: document.id,
        fileName: document.fileName,
        contentType: document.contentType,
        contentLength: document.contentLength,
        checksumSha256: document.checksumSha256,
        createdAt: document.createdAt,
      })),
    };
  }
}
