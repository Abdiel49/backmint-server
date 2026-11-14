import {
  BadRequestException,
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
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
import { PublicProfilesService } from './public-profiles.service.js';

@ApiTags('Organization profile disclosure')
@ApiBearerAuth()
@UseGuards(AuthSessionGuard)
@Controller('organizations')
export class PublicProfileDisclosureController {
  constructor(private readonly profiles: PublicProfilesService) {}

  @Patch(':organizationId/public-profile-disclosure')
  @ApiOperation({
    summary: 'Set public disclosure of the organization verification status',
  })
  @ApiParam({
    name: 'organizationId',
    format: 'uuid',
    example: 'a54e27b4-2c0a-4d66-a9ab-8c98fb6281e8',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['discloseVerificationStatus'],
      properties: {
        discloseVerificationStatus: { type: 'boolean', example: true },
      },
    },
    examples: {
      optIn: {
        summary: 'Explicitly disclose verification status',
        value: { discloseVerificationStatus: true },
      },
      optOut: {
        summary: 'Hide verification status',
        value: { discloseVerificationStatus: false },
      },
    },
  })
  @ApiOkResponse({
    description: 'Disclosure preference updated.',
    schema: {
      example: {
        organizationId: 'a54e27b4-2c0a-4d66-a9ab-8c98fb6281e8',
        discloseVerificationStatus: true,
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'The request body is invalid.',
    schema: {
      example: {
        statusCode: 400,
        message: 'discloseVerificationStatus must be a boolean',
        error: 'Bad Request',
      },
    },
  })
  @ApiForbiddenResponse({
    description:
      'Only an active organization Owner or Admin may change disclosure.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Organization owner or admin permission is required',
        error: 'Forbidden',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Organization does not exist.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Organization was not found',
        error: 'Not Found',
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
  async update(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: unknown,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    if (
      typeof body !== 'object' ||
      body === null ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      typeof (body as Record<string, unknown>).discloseVerificationStatus !==
        'boolean'
    ) {
      throw new BadRequestException(
        'discloseVerificationStatus must be a boolean',
      );
    }
    const organization = await this.profiles.setVerificationDisclosure(
      session.userId,
      organizationId,
      (body as { discloseVerificationStatus: boolean })
        .discloseVerificationStatus,
    );
    return {
      organizationId: organization.id,
      discloseVerificationStatus: organization.discloseVerificationStatus,
    };
  }
}
