import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { OpportunityService } from './opportunity.service.js';
import {
  FundingDirection,
  PublicationSourceType,
} from './publication.types.js';

@ApiTags('opportunities')
@Controller('opportunities')
export class OpportunityController {
  constructor(private readonly opportunities: OpportunityService) {}

  @Get()
  @ApiOperation({ summary: 'Browse published public Projects and Calls' })
  @ApiQuery({
    name: 'sourceType',
    required: false,
    enum: PublicationSourceType,
  })
  @ApiQuery({ name: 'direction', required: false, enum: FundingDirection })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'offset', required: false, example: 0 })
  @ApiOkResponse({
    description:
      'A stable page of public opportunity summaries with confidential participation data omitted.',
    schema: {
      example: {
        items: [
          {
            sourceType: 'Call',
            sourceId: 'f64f0d7f-d6f1-4c33-b27e-9aefb8b1f11c',
            title: 'Community Solar Grants',
            description: 'Funding for locally led solar projects.',
            direction: 'FundingOffered',
            visibility: 'Public',
            lifecycleStatus: 'Published',
            intakeStatus: 'Open',
            publishedAt: '2026-11-14T12:00:00.000Z',
            audienceTypes: ['Community', 'Nonprofit'],
            supportTypes: ['Grant'],
          },
        ],
        limit: 20,
        offset: 0,
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid filter or pagination value.',
    schema: {
      example: {
        statusCode: 400,
        message: 'limit must be 1-100 and offset must be non-negative',
        error: 'Bad Request',
      },
    },
  })
  async browse(
    @Query('sourceType') sourceType?: string,
    @Query('direction') direction?: string,
    @Query('limit') limitValue?: string,
    @Query('offset') offsetValue?: string,
  ) {
    const limit = limitValue === undefined ? 20 : Number(limitValue);
    const offset = offsetValue === undefined ? 0 : Number(offsetValue);
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isSafeInteger(offset) ||
      offset < 0
    ) {
      throw new BadRequestException(
        'limit must be 1-100 and offset must be non-negative',
      );
    }
    if (
      sourceType &&
      !Object.values(PublicationSourceType).includes(sourceType as never)
    ) {
      throw new BadRequestException('sourceType must be Project or Call');
    }
    if (
      direction &&
      !Object.values(FundingDirection).includes(direction as never)
    ) {
      throw new BadRequestException(
        'direction must be FundingOffered or FundingRequested',
      );
    }
    return this.opportunities.browse({
      sourceType: sourceType as
        | (typeof PublicationSourceType)[keyof typeof PublicationSourceType]
        | undefined,
      direction: direction as
        (typeof FundingDirection)[keyof typeof FundingDirection] | undefined,
      limit,
      offset,
    });
  }
}
