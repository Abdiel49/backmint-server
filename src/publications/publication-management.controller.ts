import {
  BadRequestException,
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthSessionGuard, CurrentSession } from '../identity/auth-session.guard.js';
import type { AuthenticatedSession } from '../identity/auth-session.service.js';
import { z } from 'zod';
import {
  createCallSchema,
  createProjectSchema,
  setIntakeSchema,
  setVisibilitySchema,
  transitionLifecycleSchema,
  updateCallSchema,
  updateProjectSchema,
} from './publication-management.dto.js';
import { PublicationManagementService } from './publication-management.service.js';

const idExample = '5f3f652e-b349-4fb6-81b9-91c27652d0a8';
const orgExample = '7c6f2ef9-1918-45da-88f4-dfa0474bd9d5';
const responseExample = {
  id: idExample,
  title: 'Community Solar Grants',
  description: 'Funding for locally led solar projects.',
  direction: 'FundingOffered',
  visibility: 'Private',
  lifecycleStatus: 'Draft',
  intakeStatus: 'Open',
  ownerOrganizationId: orgExample,
};
const projectExample = {
  ownerOrganizationId: orgExample,
  title: 'Community Solar Pilot',
  description: 'Install a small solar system for a community center.',
  direction: 'FundingRequested',
  visibility: 'Private',
  objectives: ['Install a 20 kW solar system'],
  costs: [{ name: 'Solar panels', amount: '18000', asset: 'USDC' }],
  deliverables: ['Commissioned solar installation'],
};
const callExample = {
  ownerOrganizationId: orgExample,
  title: 'Community Solar Grants',
  description: 'Funding for locally led solar projects.',
  direction: 'FundingOffered',
  visibility: 'Private',
  audienceTypes: ['Community', 'Nonprofit'],
  supportTypes: ['Grant'],
  maximumAwards: 8,
  allocationMode: 'Multiple',
  overallBudget: '100000',
  targetAsset: 'USDC',
};

@ApiTags('Project and Call management')
@ApiBearerAuth()
@UseGuards(AuthSessionGuard)
@Controller()
@ApiUnauthorizedResponse({ description: 'A valid bearer session is required.', schema: { example: { statusCode: 401, message: 'A valid bearer session is required', error: 'Unauthorized' } } })
@ApiForbiddenResponse({ description: 'The caller lacks an active authorized organization membership.', schema: { example: { statusCode: 403, message: 'Active Owner, Admin, or ProjectManager membership is required', error: 'Forbidden' } } })
@ApiNotFoundResponse({ description: 'The publication does not exist or is not manageable by the caller.', schema: { example: { statusCode: 404, message: 'Publication was not found', error: 'Not Found' } } })
@ApiBadRequestResponse({ description: 'The request body, publication policy, or requested state transition is invalid.', schema: { example: { statusCode: 400, message: 'Request body is invalid', error: 'Bad Request' } } })
export class PublicationManagementController {
  constructor(private readonly management: PublicationManagementService) {}

  @Post('projects')
  @ApiOperation({ summary: 'Create an independent Project' })
  @ApiBody({ schema: { example: projectExample } })
  @ApiCreatedResponse({ description: 'Project created as a private draft.', schema: { example: { ...responseExample, title: 'Community Solar Pilot', direction: 'FundingRequested' } } })
  @ApiBadRequestResponse({ description: 'Invalid Project fields or policy.', schema: { example: { statusCode: 400, message: 'A Project requires at least one objective', error: 'Bad Request' } } })
  async createProject(@Body() body: unknown, @CurrentSession() session: AuthenticatedSession) {
    return this.management.createProject(session.userId, this.parse(createProjectSchema, body));
  }

  @Post('calls')
  @ApiOperation({ summary: 'Create an independent Call' })
  @ApiBody({ schema: { example: callExample } })
  @ApiCreatedResponse({ description: 'Call created as a private draft.', schema: { example: responseExample } })
  @ApiBadRequestResponse({ description: 'Invalid Call fields or policy.', schema: { example: { statusCode: 400, message: 'A Call requires a non-empty audience', error: 'Bad Request' } } })
  async createCall(@Body() body: unknown, @CurrentSession() session: AuthenticatedSession) {
    return this.management.createCall(session.userId, this.parse(createCallSchema, body));
  }

  @Patch('projects/:id')
  @ApiOperation({ summary: 'Update a manageable Project' })
  @ApiParam({ name: 'id', format: 'uuid', example: idExample })
  @ApiBody({ schema: { example: { title: 'Revised Community Solar Pilot', description: 'A revised project scope.', objectives: ['Install a 25 kW solar system'] } } })
  @ApiOkResponse({ description: 'Project updated.', schema: { example: { ...responseExample, title: 'Revised Community Solar Pilot' } } })
  @ApiBadRequestResponse({ description: 'Invalid or unsupported Project fields.', schema: { example: { statusCode: 400, message: 'Request body is invalid', error: 'Bad Request' } } })
  async updateProject(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() session: AuthenticatedSession) {
    return this.management.updateProject(session.userId, id, this.parse(updateProjectSchema, body));
  }

  @Patch('calls/:id')
  @ApiOperation({ summary: 'Update a manageable Call' })
  @ApiParam({ name: 'id', format: 'uuid', example: idExample })
  @ApiBody({ schema: { example: { title: 'Regional Solar Grants', overallBudget: '125000', maximumAwards: 10 } } })
  @ApiOkResponse({ description: 'Call updated.', schema: { example: { ...responseExample, title: 'Regional Solar Grants' } } })
  @ApiBadRequestResponse({ description: 'Invalid or unsupported Call fields.', schema: { example: { statusCode: 400, message: 'Request body is invalid', error: 'Bad Request' } } })
  async updateCall(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() session: AuthenticatedSession) {
    return this.management.updateCall(session.userId, id, this.parse(updateCallSchema, body));
  }

  @Post('projects/:id/publish')
  @ApiOperation({ summary: 'Publish a manageable Project and create its first immutable version' })
  @ApiParam({ name: 'id', format: 'uuid', example: idExample })
  @ApiOkResponse({ description: 'Project published.', schema: { example: { ...responseExample, lifecycleStatus: 'Published', publishedAt: '2026-11-14T12:00:00.000Z' } } })
  @ApiBadRequestResponse({ description: 'Project cannot be published in its current state or fails policy validation.', schema: { example: { statusCode: 400, message: 'Only a draft publication can be published', error: 'Bad Request' } } })
  publishProject(@Param('id', ParseUUIDPipe) id: string, @CurrentSession() session: AuthenticatedSession) {
    return this.management.publishProject(session.userId, id);
  }

  @Post('calls/:id/publish')
  @ApiOperation({ summary: 'Publish a manageable Call and create its first immutable version' })
  @ApiParam({ name: 'id', format: 'uuid', example: idExample })
  @ApiOkResponse({ description: 'Call published.', schema: { example: { ...responseExample, lifecycleStatus: 'Published', publishedAt: '2026-11-14T12:00:00.000Z' } } })
  @ApiBadRequestResponse({ description: 'Call cannot be published in its current state or fails policy validation.', schema: { example: { statusCode: 400, message: 'Only a draft publication can be published', error: 'Bad Request' } } })
  publishCall(@Param('id', ParseUUIDPipe) id: string, @CurrentSession() session: AuthenticatedSession) {
    return this.management.publishCall(session.userId, id);
  }

  @Patch('projects/:id/visibility')
  @ApiOperation({ summary: 'Change Project visibility independently from intake' })
  @ApiParam({ name: 'id', format: 'uuid', example: idExample })
  @ApiBody({ schema: { example: { visibility: 'Unlisted' } } })
  @ApiOkResponse({ description: 'Project visibility changed.', schema: { example: { ...responseExample, visibility: 'Unlisted' } } })
  updateProjectVisibility(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() session: AuthenticatedSession) {
    const { visibility } = this.parse(setVisibilitySchema, body);
    return this.management.setProjectVisibility(session.userId, id, visibility as never);
  }

  @Patch('calls/:id/visibility')
  @ApiOperation({ summary: 'Change Call visibility independently from intake' })
  @ApiParam({ name: 'id', format: 'uuid', example: idExample })
  @ApiBody({ schema: { example: { visibility: 'Unlisted' } } })
  @ApiOkResponse({ description: 'Call visibility changed.', schema: { example: { ...responseExample, visibility: 'Unlisted' } } })
  updateCallVisibility(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() session: AuthenticatedSession) {
    const { visibility } = this.parse(setVisibilitySchema, body);
    return this.management.setCallVisibility(session.userId, id, visibility as never);
  }

  @Patch('projects/:id/intake')
  @ApiOperation({ summary: 'Change Project intake independently from visibility' })
  @ApiParam({ name: 'id', format: 'uuid', example: idExample })
  @ApiBody({ schema: { example: { intakeStatus: 'Paused' } } })
  @ApiOkResponse({ description: 'Project intake changed.', schema: { example: { ...responseExample, intakeStatus: 'Paused' } } })
  updateProjectIntake(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() session: AuthenticatedSession) {
    const { intakeStatus } = this.parse(setIntakeSchema, body);
    return this.management.setProjectIntake(session.userId, id, intakeStatus as never);
  }

  @Patch('calls/:id/intake')
  @ApiOperation({ summary: 'Change Call intake independently from visibility' })
  @ApiParam({ name: 'id', format: 'uuid', example: idExample })
  @ApiBody({ schema: { example: { intakeStatus: 'Paused' } } })
  @ApiOkResponse({ description: 'Call intake changed.', schema: { example: { ...responseExample, intakeStatus: 'Paused' } } })
  updateCallIntake(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() session: AuthenticatedSession) {
    const { intakeStatus } = this.parse(setIntakeSchema, body);
    return this.management.setCallIntake(session.userId, id, intakeStatus as never);
  }

  @Patch('projects/:id/lifecycle')
  @ApiOperation({ summary: 'Transition Project lifecycle state' })
  @ApiParam({ name: 'id', format: 'uuid', example: idExample })
  @ApiBody({ schema: { example: { lifecycleStatus: 'Active' } } })
  @ApiOkResponse({ description: 'Project lifecycle transitioned.', schema: { example: { ...responseExample, lifecycleStatus: 'Active' } } })
  @ApiBadRequestResponse({ description: 'Lifecycle transition is not permitted.', schema: { example: { statusCode: 400, message: 'Invalid lifecycle transition', error: 'Bad Request' } } })
  updateProjectLifecycle(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() session: AuthenticatedSession) {
    const { lifecycleStatus } = this.parse(transitionLifecycleSchema, body);
    return this.management.transitionProject(session.userId, id, lifecycleStatus as never);
  }

  @Patch('calls/:id/lifecycle')
  @ApiOperation({ summary: 'Transition Call lifecycle state' })
  @ApiParam({ name: 'id', format: 'uuid', example: idExample })
  @ApiBody({ schema: { example: { lifecycleStatus: 'Active' } } })
  @ApiOkResponse({ description: 'Call lifecycle transitioned.', schema: { example: { ...responseExample, lifecycleStatus: 'Active' } } })
  @ApiBadRequestResponse({ description: 'Lifecycle transition is not permitted.', schema: { example: { statusCode: 400, message: 'Invalid lifecycle transition', error: 'Bad Request' } } })
  updateCallLifecycle(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() session: AuthenticatedSession) {
    const { lifecycleStatus } = this.parse(transitionLifecycleSchema, body);
    return this.management.transitionCall(session.userId, id, lifecycleStatus as never);
  }

  private parse<T>(schema: z.ZodType<T>, body: unknown): T {
    const result = schema.safeParse(body);
    if (!result.success) throw new BadRequestException('Request body is invalid');
    return result.data;
  }
}
