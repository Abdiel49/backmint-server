import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PublicProfilesService } from './public-profiles.service.js';

@ApiTags('Public profiles')
@Controller('public')
@Throttle({ publicEmbed: { limit: 60, ttl: 60000 } })
export class PublicProfilesController {
  constructor(private readonly profiles: PublicProfilesService) {}

  @Get('organizations')
  @ApiOperation({ summary: 'List public organization profiles' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'offset', required: false, example: 0 })
  @ApiOkResponse({
    description: 'Stable slug-ordered page of public organizations.',
    schema: {
      example: {
        items: [
          {
            id: 'a54e27b4-2c0a-4d66-a9ab-8c98fb6281e8',
            slug: 'green-futures-bolivia',
            name: 'Green Futures Bolivia',
            organizationType: 'Nonprofit',
            country: 'BO',
            legalStatus: 'Incorporated',
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Pagination parameters are invalid.',
    schema: {
      example: {
        statusCode: 400,
        message: 'limit must be 1-100 and offset must be non-negative',
        error: 'Bad Request',
      },
    },
  })
  async listOrganizations(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const page = this.pagination(limit, offset);
    return this.profiles.listOrganizations(page.limit, page.offset);
  }

  @Get('organizations/:identifier')
  @ApiOperation({
    summary: 'Read a public or directly linked unlisted organization profile',
  })
  @ApiParam({
    name: 'identifier',
    example: 'green-futures-bolivia',
    description:
      'Public profiles accept a slug; unlisted profiles require the organization UUID direct link.',
  })
  @ApiOkResponse({
    description: 'Privacy-filtered organization profile.',
    schema: {
      example: {
        id: 'a54e27b4-2c0a-4d66-a9ab-8c98fb6281e8',
        slug: 'green-futures-bolivia',
        name: 'Green Futures Bolivia',
        organizationType: 'Nonprofit',
        country: 'BO',
        legalStatus: 'Incorporated',
        verification: { status: 'Verified' },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Private, inactive, or unknown profile.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Public profile was not found',
        error: 'Not Found',
      },
    },
  })
  organization(@Param('identifier') identifier: string) {
    return this.profiles.organization(identifier);
  }

  @Get('opportunities/:sourceType/:id')
  @ApiOperation({ summary: 'Read a published Project or Call profile' })
  @ApiParam({ name: 'sourceType', enum: ['Project', 'Call'], example: 'Call' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: 'f64f0d7f-d6f1-4c33-b27e-9aefb8b1f11c',
    description:
      'UUID direct link; unlisted sources are never returned by public listings.',
  })
  @ApiOkResponse({
    description: 'Published fields and opted-in disclosures only.',
    schema: {
      example: {
        sourceType: 'Call',
        id: 'f64f0d7f-d6f1-4c33-b27e-9aefb8b1f11c',
        title: 'Community Solar Grants',
        description: 'Funding for locally led solar projects.',
        direction: 'FundingOffered',
        lifecycleStatus: 'Published',
        intakeStatus: 'Open',
        publishedAt: '2026-11-14T12:00:00.000Z',
        audienceTypes: ['Community', 'Nonprofit'],
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Private, inactive, or unknown source.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Public profile was not found',
        error: 'Not Found',
      },
    },
  })
  opportunity(
    @Param('sourceType') sourceType: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (!['Project', 'Call'].includes(sourceType))
      throw new BadRequestException('sourceType must be Project or Call');
    return this.profiles.opportunity(sourceType as 'Project' | 'Call', id);
  }

  private pagination(limitValue?: string, offsetValue?: string) {
    const limit = limitValue === undefined ? 20 : Number(limitValue);
    const offset = offsetValue === undefined ? 0 : Number(offsetValue);
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isSafeInteger(offset) ||
      offset < 0
    )
      throw new BadRequestException(
        'limit must be 1-100 and offset must be non-negative',
      );
    return { limit, offset };
  }
}
