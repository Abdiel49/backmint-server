import {
  BadRequestException,
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Get,
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
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { z } from 'zod';
import { AuthSessionGuard, CurrentSession } from '../identity/auth-session.guard.js';
import type { AuthenticatedSession } from '../identity/auth-session.service.js';
import { CreateMilestoneEvidenceDto, createMilestoneEvidenceSchema } from './milestone-evidence.dto.js';
import { MilestoneEvidenceService } from './milestone-evidence.service.js';

@ApiTags('Milestones')
@ApiBearerAuth()
@UseGuards(AuthSessionGuard)
@Controller('milestones/:milestoneId/evidence')
export class MilestoneEvidenceController {
  constructor(private readonly evidence: MilestoneEvidenceService) {}

  @Post()
  @ApiParam({ name: 'milestoneId', format: 'uuid', example: 'e8cf3664-5575-4e06-92a4-c822a873d213' })
  @ApiOperation({
    summary: 'Create a private, versioned milestone evidence upload',
    description: 'Only an active Award recipient may create an upload. Every asset is private and remains unavailable to reviewers until storage checks and malware scanning pass.',
  })
  @ApiBody({ type: CreateMilestoneEvidenceDto })
  @ApiCreatedResponse({
    description: 'Evidence version created with short-lived upload URLs. Call the completion endpoint after every file is uploaded.',
    schema: { example: {
      milestoneId: 'e8cf3664-5575-4e06-92a4-c822a873d213',
      submissionId: 'ab9937a4-a409-4442-99e1-a08dfb1a023b',
      version: 1,
      status: 'PendingUpload',
      uploadAssets: [{
        assetId: '4e38df44-63d1-467a-90d4-bde6bce3e6db',
        uploadUrl: 'https://objects.example.test/backmint/milestones/...?...',
        expiresAt: '2026-11-14T14:00:00.000Z',
        requiredHeaders: { 'content-type': 'application/pdf', 'x-amz-checksum-sha256': 'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo=' },
      }],
    } },
  })
  @ApiBadRequestResponse({ description: 'Asset count, MIME type, checksum, or size is invalid.' })
  @ApiForbiddenResponse({ description: 'Only an active member of the Award recipient may upload evidence.' })
  @ApiNotFoundResponse({ description: 'Milestone or Award was not found.' })
  @ApiConflictResponse({ description: 'Milestone is not accepting evidence or another upload is in progress.' })
  @ApiUnauthorizedResponse({ description: 'A valid bearer session is required.' })
  async createUpload(
    @Param('milestoneId', ParseUUIDPipe) milestoneId: string,
    @Body({ schema: createMilestoneEvidenceSchema }) body: z.infer<typeof createMilestoneEvidenceSchema>,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const parsed = createMilestoneEvidenceSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Milestone evidence payload is invalid');
    return this.evidence.createUpload({ milestoneId, actorUserId: session.userId, assets: parsed.data.assets });
  }

  @Post(':submissionId/complete')
  @ApiParam({ name: 'milestoneId', format: 'uuid', example: 'e8cf3664-5575-4e06-92a4-c822a873d213' })
  @ApiParam({ name: 'submissionId', format: 'uuid', example: 'ab9937a4-a409-4442-99e1-a08dfb1a023b' })
  @ApiOperation({ summary: 'Verify uploaded milestone evidence and queue malware scanning' })
  @ApiOkResponse({ description: 'The upload is complete and private scanning is in progress.', schema: { example: { submissionId: 'ab9937a4-a409-4442-99e1-a08dfb1a023b', version: 1, status: 'Scanning' } } })
  @ApiUnauthorizedResponse({ description: 'A valid bearer session is required.' })
  @ApiForbiddenResponse({ description: 'Only the Award recipient may complete evidence uploads.' })
  @ApiNotFoundResponse({ description: 'Milestone or evidence submission was not found.' })
  @ApiConflictResponse({ description: 'Stored object size/checksum does not match or evidence is quarantined.' })
  @ApiServiceUnavailableResponse({ description: 'Private storage or scan queue is temporarily unavailable; retry completion.' })
  async completeUpload(
    @Param('milestoneId', ParseUUIDPipe) milestoneId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    return this.evidence.completeUpload({ milestoneId, submissionId, actorUserId: session.userId });
  }

  @Get(':submissionId/assets/:assetId/download')
  @ApiParam({ name: 'milestoneId', format: 'uuid', example: 'e8cf3664-5575-4e06-92a4-c822a873d213' })
  @ApiParam({ name: 'submissionId', format: 'uuid', example: 'ab9937a4-a409-4442-99e1-a08dfb1a023b' })
  @ApiParam({ name: 'assetId', format: 'uuid', example: '4e38df44-63d1-467a-90d4-bde6bce3e6db' })
  @ApiOperation({ summary: 'Create a short-lived private download URL for scanned milestone evidence' })
  @ApiOkResponse({ description: 'URL returned to an authorized recipient, uploader, or assigned reviewer.', schema: { example: { assetId: '4e38df44-63d1-467a-90d4-bde6bce3e6db', url: 'https://objects.example.test/backmint/milestones/...?...', expiresAt: '2026-11-14T14:00:00.000Z' } } })
  @ApiUnauthorizedResponse({ description: 'A valid bearer session is required.' })
  @ApiForbiddenResponse({ description: 'Award recipient or assigned reviewer access is required.' })
  @ApiNotFoundResponse({ description: 'Milestone, submission, or evidence asset was not found.' })
  @ApiConflictResponse({ description: 'Evidence is not available until all assets pass scanning.' })
  async createDownloadUrl(
    @Param('milestoneId', ParseUUIDPipe) milestoneId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    return this.evidence.createDownloadUrl({ milestoneId, submissionId, assetId, actorUserId: session.userId });
  }
}
