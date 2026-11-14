import { BadRequestException, Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiServiceUnavailableResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { z } from 'zod';
import { AuthSessionGuard, CurrentSession } from '../identity/auth-session.guard.js';
import type { AuthenticatedSession } from '../identity/auth-session.service.js';
import { ApplicationAttachmentService } from './application-attachment.service.js';

const uploadSchema = z.strictObject({
  organizationId: z.uuid().optional(),
  mimeType: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/).max(255),
  sizeBytes: z.number().int().positive().max(50_000_000),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
});

@ApiTags('Applications')
@ApiBearerAuth()
@UseGuards(AuthSessionGuard)
@Controller('applications/attachments')
export class ApplicationAttachmentController {
  constructor(private readonly attachments: ApplicationAttachmentService) {}

  @Post('uploads')
  @ApiOperation({ summary: 'Register a private Application attachment upload', description: 'Creates an upload before Application submission. The attachment remains pending and is not verified or available for review.' })
  @ApiBody({ schema: { type: 'object', additionalProperties: false, required: ['mimeType', 'sizeBytes', 'checksumSha256'], properties: { organizationId: { type: 'string', format: 'uuid', example: '7c6f2ef9-1918-45da-88f4-dfa0474bd9d5' }, mimeType: { type: 'string', example: 'application/pdf' }, sizeBytes: { type: 'integer', example: 524288 }, checksumSha256: { type: 'string', example: 'a'.repeat(64) } } } })
  @ApiCreatedResponse({ description: 'Attachment registered and private upload URL issued.', schema: { example: { attachmentId: '4e38df44-63d1-467a-90d4-bde6bce3e6db', status: 'PendingUpload', uploadUrl: 'https://objects.example.test/backmint/applications/uploads/file?signature=example', expiresAt: '2027-01-15T18:00:00.000Z', requiredHeaders: { 'content-type': 'application/pdf', 'x-amz-checksum-sha256': 'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo=' } } } })
  @ApiBadRequestResponse({ description: 'Invalid metadata or attachment exceeds the scan size limit.', schema: { example: { statusCode: 400, message: 'Application attachment payload is invalid', error: 'Bad Request' } } })
  @ApiUnauthorizedResponse({ description: 'A valid bearer session is required.', schema: { example: { statusCode: 401, message: 'A valid bearer session is required', error: 'Unauthorized' } } })
  @ApiForbiddenResponse({ description: 'Applicant organization authority is required.', schema: { example: { statusCode: 403, message: 'Active applicant organization authority is required', error: 'Forbidden' } } })
  createUpload(@Body() body: unknown, @CurrentSession() session: AuthenticatedSession) {
    const result = uploadSchema.safeParse(body);
    if (!result.success) throw new BadRequestException('Application attachment payload is invalid');
    return this.attachments.createUpload(session.userId, result.data);
  }

  @Post(':attachmentId/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirm a private Application attachment upload', description: 'Checks object size and SHA-256 checksum. The attachment remains unavailable for review and pending malware scanning.' })
  @ApiParam({ name: 'attachmentId', format: 'uuid', example: '4e38df44-63d1-467a-90d4-bde6bce3e6db' })
  @ApiOkResponse({ description: 'Upload verified; malware scanning is still pending.', schema: { example: { attachmentId: '4e38df44-63d1-467a-90d4-bde6bce3e6db', status: 'Uploaded' } } })
  @ApiBadRequestResponse({ description: 'Attachment identifier is invalid.', schema: { example: { statusCode: 400, message: 'Validation failed (uuid is expected)', error: 'Bad Request' } } })
  @ApiUnauthorizedResponse({ description: 'A valid bearer session is required.', schema: { example: { statusCode: 401, message: 'A valid bearer session is required', error: 'Unauthorized' } } })
  @ApiForbiddenResponse({ description: 'The uploader lacks active organization authority.', schema: { example: { statusCode: 403, message: 'Active applicant organization authority is required', error: 'Forbidden' } } })
  @ApiNotFoundResponse({ description: 'The attachment is not available to this uploader.', schema: { example: { statusCode: 404, message: 'Application attachment was not found', error: 'Not Found' } } })
  @ApiConflictResponse({ description: 'The object is missing or does not match its declared size and checksum.', schema: { example: { statusCode: 409, message: 'Uploaded application attachment does not match its declared size and SHA-256 checksum', error: 'Conflict' } } })
  @ApiServiceUnavailableResponse({ description: 'Private object storage is unavailable.', schema: { example: { statusCode: 503, message: 'Private object storage is unavailable for upload verification', error: 'Service Unavailable' } } })
  completeUpload(@Param('attachmentId', ParseUUIDPipe) attachmentId: string, @CurrentSession() session: AuthenticatedSession) {
    return this.attachments.completeUpload(session.userId, attachmentId);
  }
}
