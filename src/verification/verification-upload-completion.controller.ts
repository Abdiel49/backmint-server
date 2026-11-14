import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AuthSessionGuard,
  CurrentSession,
} from '../identity/auth-session.guard.js';
import type { AuthenticatedSession } from '../identity/auth-session.service.js';
import { VerificationDocumentScanService } from './verification-document-scan.service.js';

@ApiTags('Verification uploads')
@ApiBearerAuth()
@UseGuards(AuthSessionGuard)
@Controller('verification-cases/:caseId/documents/:documentId')
export class VerificationUploadCompletionController {
  constructor(private readonly verification: VerificationDocumentScanService) {}

  @Post('complete')
  @ApiParam({
    name: 'caseId',
    format: 'uuid',
    example: 'b44383ce-e03f-4bed-9c34-020bff9e5f6a',
  })
  @ApiParam({
    name: 'documentId',
    format: 'uuid',
    example: '36cb7118-d7d5-48f3-a39e-7ea0a62d340b',
  })
  @ApiOperation({
    summary:
      'Verify a private organization document upload and enqueue malware scanning',
    description:
      'Checks the stored object length and SHA-256 metadata/checksum before placing it on the malware scan queue. The object remains private while pending, failed, or quarantined.',
  })
  @ApiOkResponse({
    description:
      'Upload completion was verified and malware scanning was queued.',
    schema: {
      example: {
        documentId: '36cb7118-d7d5-48f3-a39e-7ea0a62d340b',
        scanStatus: 'Queued',
      },
    },
  })
  @ApiConflictResponse({
    description:
      'The object is missing, has a mismatched length/checksum, or the case/document state does not allow completion.',
    schema: {
      example: {
        statusCode: 409,
        message:
          'Uploaded verification object does not match its declared length and SHA-256 checksum',
        error: 'Conflict',
      },
    },
  })
  @ApiNotFoundResponse({
    description:
      'The case/document was not found or is outside the caller organization scope.',
  })
  @ApiUnauthorizedResponse({
    description: 'A valid bearer session is required.',
  })
  @ApiServiceUnavailableResponse({
    description:
      'The scan job could not be queued; the private document remains pending for retry.',
    schema: {
      example: {
        statusCode: 503,
        message:
          'Malware scan could not be scheduled; the private document will be retried',
        error: 'Service Unavailable',
      },
    },
  })
  async complete(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    return this.verification.completeUpload(session.userId, caseId, documentId);
  }
}
