import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import {
  AuthSessionGuard,
  CurrentSession,
} from '../identity/auth-session.guard.js';
import type { AuthenticatedSession } from '../identity/auth-session.service.js';
import { OrganizationMembershipService } from './organization-membership.service.js';
import { OrganizationService } from './organization.service.js';
import {
  ChangeOrganizationMemberRoleDto,
  changeOrganizationMemberRoleSchema,
  CreateOrganizationDto,
  createOrganizationSchema,
  InviteOrganizationMemberDto,
  inviteOrganizationMemberSchema,
  OrganizationMembershipResponseDto,
  OrganizationResponseDto,
} from './organization.dto.js';

@ApiTags('Organizations')
@ApiBearerAuth()
@UseGuards(AuthSessionGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizations: OrganizationService,
    private readonly memberships: OrganizationMembershipService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create an organization owned by the caller' })
  @ApiBody({
    type: CreateOrganizationDto,
    examples: {
      nonprofit: {
        summary: 'Create a private nonprofit organization',
        value: {
          slug: 'green-futures-bolivia',
          name: 'Green Futures Bolivia',
          organizationType: 'Nonprofit',
          country: 'BO',
          legalStatus: 'Incorporated',
          visibility: 'Private',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description:
      'Organization and active Owner membership were created atomically.',
    type: OrganizationResponseDto,
    schema: {
      example: {
        id: 'a54e27b4-2c0a-4d66-a9ab-8c98fb6281e8',
        slug: 'green-futures-bolivia',
        name: 'Green Futures Bolivia',
        organizationType: 'Nonprofit',
        country: 'BO',
        legalStatus: 'Incorporated',
        visibility: 'Private',
        status: 'Active',
        ownerUserId: 'cba05615-9665-4d4c-a38e-05d69fa17536',
        createdAt: '2026-11-14T12:00:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'The request body does not match the organization schema.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Invalid organization payload',
        error: 'Bad Request',
      },
    },
  })
  @ApiConflictResponse({
    description: 'The organization slug is already in use.',
    schema: {
      example: {
        statusCode: 409,
        message: 'Organization slug is already in use',
        error: 'Conflict',
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
  async create(
    @Body() body: CreateOrganizationDto,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const parsed = createOrganizationSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Invalid organization payload');
    }
    return this.organizations.create(session.userId, parsed.data);
  }

  @Get()
  @ApiOperation({ summary: 'List the caller’s active organizations' })
  @ApiOkResponse({
    description: 'Organizations where the caller has an active membership.',
    type: OrganizationResponseDto,
    isArray: true,
    schema: {
      example: [
        {
          id: 'a54e27b4-2c0a-4d66-a9ab-8c98fb6281e8',
          slug: 'green-futures-bolivia',
          name: 'Green Futures Bolivia',
          organizationType: 'Nonprofit',
          country: 'BO',
          legalStatus: 'Incorporated',
          visibility: 'Private',
          status: 'Active',
          ownerUserId: 'cba05615-9665-4d4c-a38e-05d69fa17536',
          createdAt: '2026-11-14T12:00:00.000Z',
        },
      ],
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
  list(@CurrentSession() session: AuthenticatedSession) {
    return this.organizations.listForUser(session.userId);
  }

  @Post(':organizationId/memberships')
  @ApiParam({
    name: 'organizationId',
    format: 'uuid',
    example: 'a54e27b4-2c0a-4d66-a9ab-8c98fb6281e8',
  })
  @ApiOperation({ summary: 'Invite an active user to the organization' })
  @ApiBody({
    type: InviteOrganizationMemberDto,
    examples: {
      evaluator: {
        summary: 'Invite an evaluator',
        value: {
          userId: 'd899b174-ff35-4c79-9b42-262f694281d5',
          role: 'Evaluator',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description:
      'Invitation created; it can only be accepted by the invited user.',
    type: OrganizationMembershipResponseDto,
    schema: {
      example: {
        id: 'f92f7e44-bef9-46a3-8e25-f346161ce716',
        organizationId: 'a54e27b4-2c0a-4d66-a9ab-8c98fb6281e8',
        userId: 'd899b174-ff35-4c79-9b42-262f694281d5',
        role: 'Evaluator',
        status: 'Invited',
        invitedByUserId: 'cba05615-9665-4d4c-a38e-05d69fa17536',
        acceptedAt: null,
        revokedAt: null,
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid invitation or Owner role requested.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Invalid organization invitation payload',
        error: 'Bad Request',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Only an organization Owner or Admin may invite members.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Organization management permission is required',
        error: 'Forbidden',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Organization or active target user was not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Active user was not found',
        error: 'Not Found',
      },
    },
  })
  @ApiConflictResponse({
    description: 'The target already has a current membership.',
    schema: {
      example: {
        statusCode: 409,
        message: 'User already has an active membership or pending invitation',
        error: 'Conflict',
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
  async invite(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: InviteOrganizationMemberDto,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const parsed = inviteOrganizationMemberSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Invalid organization invitation payload');
    }
    return this.memberships.inviteMember(
      session.userId,
      organizationId,
      parsed.data,
    );
  }

  @Post('memberships/:membershipId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiParam({
    name: 'membershipId',
    format: 'uuid',
    example: 'f92f7e44-bef9-46a3-8e25-f346161ce716',
  })
  @ApiOperation({
    summary: 'Accept the caller’s pending membership invitation',
  })
  @ApiOkResponse({
    description: 'The invitation is now an active membership.',
    type: OrganizationMembershipResponseDto,
    schema: {
      example: {
        id: 'f92f7e44-bef9-46a3-8e25-f346161ce716',
        organizationId: 'a54e27b4-2c0a-4d66-a9ab-8c98fb6281e8',
        userId: 'd899b174-ff35-4c79-9b42-262f694281d5',
        role: 'Evaluator',
        status: 'Active',
        acceptedAt: '2026-11-14T12:15:00.000Z',
      },
    },
  })
  @ApiNotFoundResponse({
    description:
      'No invitation with this ID belongs to the authenticated user.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Invitation was not found',
        error: 'Not Found',
      },
    },
  })
  @ApiConflictResponse({
    description: 'The invitation is no longer pending.',
    schema: {
      example: {
        statusCode: 409,
        message: 'Invitation is no longer pending',
        error: 'Conflict',
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
  acceptInvitation(
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    return this.memberships.acceptInvitation(session.userId, membershipId);
  }

  @Patch('memberships/:membershipId/role')
  @ApiParam({
    name: 'membershipId',
    format: 'uuid',
    example: 'f92f7e44-bef9-46a3-8e25-f346161ce716',
  })
  @ApiOperation({ summary: 'Change an active member’s organization role' })
  @ApiBody({
    type: ChangeOrganizationMemberRoleDto,
    examples: {
      projectManager: {
        summary: 'Promote a member to project manager',
        value: { role: 'ProjectManager' },
      },
    },
  })
  @ApiOkResponse({
    description: 'Membership role was updated.',
    type: OrganizationMembershipResponseDto,
    schema: {
      example: {
        id: 'f92f7e44-bef9-46a3-8e25-f346161ce716',
        organizationId: 'a54e27b4-2c0a-4d66-a9ab-8c98fb6281e8',
        userId: 'd899b174-ff35-4c79-9b42-262f694281d5',
        role: 'ProjectManager',
        status: 'Active',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid role or Owner role requested.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Invalid organization membership role',
        error: 'Bad Request',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Only an organization Owner or Admin may change roles.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Organization management permission is required',
        error: 'Forbidden',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Membership was not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Organization membership was not found',
        error: 'Not Found',
      },
    },
  })
  @ApiConflictResponse({
    description:
      'The owner cannot be modified and only active memberships can change role.',
    schema: {
      example: {
        statusCode: 409,
        message: 'Organization owner role cannot be changed',
        error: 'Conflict',
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
  async changeRole(
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() body: ChangeOrganizationMemberRoleDto,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const parsed = changeOrganizationMemberRoleSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Invalid organization membership role');
    }
    return this.memberships.changeRole(
      session.userId,
      membershipId,
      parsed.data.role,
    );
  }

  @Delete('memberships/:membershipId')
  @HttpCode(HttpStatus.OK)
  @ApiParam({
    name: 'membershipId',
    format: 'uuid',
    example: 'f92f7e44-bef9-46a3-8e25-f346161ce716',
  })
  @ApiOperation({ summary: 'Revoke an organization membership or invitation' })
  @ApiOkResponse({
    description: 'Membership is revoked.',
    type: OrganizationMembershipResponseDto,
    schema: {
      example: {
        id: 'f92f7e44-bef9-46a3-8e25-f346161ce716',
        organizationId: 'a54e27b4-2c0a-4d66-a9ab-8c98fb6281e8',
        userId: 'd899b174-ff35-4c79-9b42-262f694281d5',
        role: 'Evaluator',
        status: 'Revoked',
        revokedAt: '2026-11-14T12:20:00.000Z',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Only an organization Owner or Admin may revoke a membership.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Organization management permission is required',
        error: 'Forbidden',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Membership was not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Organization membership was not found',
        error: 'Not Found',
      },
    },
  })
  @ApiConflictResponse({
    description: 'The owner cannot be revoked or it is already inactive.',
    schema: {
      example: {
        statusCode: 409,
        message: 'Organization owner membership cannot be revoked',
        error: 'Conflict',
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
  revokeMembership(
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    return this.memberships.revokeMembership(session.userId, membershipId);
  }
}
