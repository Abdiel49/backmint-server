import { BadRequestException, Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthSessionGuard, CurrentSession } from '../identity/auth-session.guard.js';
import type { AuthenticatedSession } from '../identity/auth-session.service.js';
import { RateLimitPolicy, UseRateLimit } from '../infrastructure/rate-limit/rate-limit.decorator.js';
import { externalEmbedInputSchema, externalEmbedUpdateSchema } from './external-embeds.dto.js';
import { ExternalEmbedsService } from './external-embeds.service.js';
import { z } from 'zod';

@ApiTags('External Embeds')
@Controller()
export class ExternalEmbedsController {
  constructor(private readonly service: ExternalEmbedsService) {}

  @Post('external-embeds')
  @UseGuards(AuthSessionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create an external embed configuration' })
  @ApiBody({ schema: { example: { hostOrganizationId: '8bc0ea27-9086-4980-8b1a-69a0e7bdc885', sourceType: 'Call', sourceId: '0b266ebc-241c-433f-b16c-2732e22a7f3d', allowedOrigins: ['https://foundation.example'], theme: { accentColor: '#164e63', surfaceColor: '#ffffff' }, mode: 'Card', status: 'Active', scriptVersion: 'v1' } } })
  @ApiResponse({ status: 201, description: 'Embed configuration created.', example: { id: '91bdbf92-19c5-4b59-bcdd-a67aeb6a44dc', status: 'Active' } })
  @ApiResponse({ status: 403, description: 'Caller lacks an active management role.' })
  async create(@Body() body: unknown, @CurrentSession() session: AuthenticatedSession) {
    return this.service.create(session.userId, this.parse(externalEmbedInputSchema, body));
  }

  @Get('organizations/:organizationId/external-embeds')
  @UseGuards(AuthSessionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List external embeds for a host organization' })
  @ApiParam({ name: 'organizationId', example: '8bc0ea27-9086-4980-8b1a-69a0e7bdc885' })
  @ApiResponse({ status: 200, description: 'Organization embed configurations.', example: [{ id: '91bdbf92-19c5-4b59-bcdd-a67aeb6a44dc', sourceType: 'Call', sourceId: '0b266ebc-241c-433f-b16c-2732e22a7f3d', allowedOrigins: ['https://foundation.example'], mode: 'Card', status: 'Active', scriptVersion: 'v1' }] })
  list(@Param('organizationId', ParseUUIDPipe) organizationId: string, @CurrentSession() session: AuthenticatedSession) {
    return this.service.list(session.userId, organizationId);
  }

  @Patch('external-embeds/:embedId')
  @UseGuards(AuthSessionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an external embed configuration' })
  @ApiParam({ name: 'embedId', example: '91bdbf92-19c5-4b59-bcdd-a67aeb6a44dc' })
  @ApiBody({ schema: { example: { allowedOrigins: ['https://foundation.example', 'https://impact.foundation.example'], status: 'Disabled', theme: { accentColor: '#164e63' } } } })
  @ApiResponse({ status: 200, description: 'Embed configuration updated.', example: { id: '91bdbf92-19c5-4b59-bcdd-a67aeb6a44dc', status: 'Disabled' } })
  async update(@Param('embedId', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() session: AuthenticatedSession) {
    return this.service.update(session.userId, id, this.parse(externalEmbedUpdateSchema, body));
  }

  @Get('public/external-embeds/:embedId')
  @UseRateLimit(RateLimitPolicy.PublicEmbed)
  @ApiOperation({ summary: 'Read the privacy-safe public projection for an external embed' })
  @ApiParam({ name: 'embedId', example: '91bdbf92-19c5-4b59-bcdd-a67aeb6a44dc' })
  @ApiResponse({ status: 200, description: 'Published source projection. Private participation and review data is never returned.', example: { id: '91bdbf92-19c5-4b59-bcdd-a67aeb6a44dc', mode: 'Card', theme: { accentColor: '#164e63' }, scriptVersion: 'v1', source: { sourceType: 'Call', sourceId: '0b266ebc-241c-433f-b16c-2732e22a7f3d', title: 'Community Solar Grants', description: 'Funding for community-owned solar projects.', direction: 'FundingOffered', visibility: 'Public', lifecycleStatus: 'Published', intakeStatus: 'Open', publishedAt: '2026-11-14T12:00:00.000Z', fundingTargetAmount: '2500000000000000000000000', targetAsset: 'NEAR', audienceTypes: ['Nonprofit'], supportTypes: ['Grant'], intakeClosesAt: '2026-12-15T00:00:00.000Z', callToAction: { method: 'POST', path: '/api/applications', authenticationRequired: true } } } })
  @ApiResponse({ status: 403, description: 'Origin is missing or not allowlisted.' })
  @ApiResponse({ status: 404, description: 'Embed is disabled or source is private/unpublished.' })
  readPublic(@Param('embedId', ParseUUIDPipe) id: string, @Headers('origin') origin: string | undefined) {
    return this.service.readPublic(id, origin);
  }

  private parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success) throw new BadRequestException(result.error.issues.map((issue) => issue.message));
    return result.data;
  }
}
