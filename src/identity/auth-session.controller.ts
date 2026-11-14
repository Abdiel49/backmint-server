import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthSessionGuard, CurrentSession } from './auth-session.guard.js';
import {
  AuthSessionService,
  type AuthenticatedSession,
} from './auth-session.service.js';

@ApiTags('Authentication')
@ApiBearerAuth()
@UseGuards(AuthSessionGuard)
@Controller('auth')
export class AuthSessionController {
  constructor(private readonly sessions: AuthSessionService) {}

  @Get('session')
  @ApiOperation({ summary: 'Get the current authenticated session' })
  @ApiResponse({
    status: 200,
    description: 'The current session context.',
    example: {
      sessionId: 'd9df9b34-0266-4e55-970d-fd774d8293e2',
      userId: 'f2625a81-2af8-4c5b-943a-07c4763fce29',
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Bearer session is missing, expired, revoked, or inactive.',
    example: {
      statusCode: 401,
      message: 'A valid bearer session is required',
      error: 'Unauthorized',
    },
  })
  getCurrentSession(@CurrentSession() session: AuthenticatedSession) {
    return { sessionId: session.id, userId: session.userId };
  }

  @Delete('session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke the current authenticated session' })
  @ApiResponse({
    status: 200,
    description: 'The current session was revoked.',
    example: { revoked: true },
  })
  @ApiResponse({
    status: 401,
    description: 'Bearer session is missing, expired, revoked, or inactive.',
    example: {
      statusCode: 401,
      message: 'A valid bearer session is required',
      error: 'Unauthorized',
    },
  })
  async revokeCurrentSession(@CurrentSession() session: AuthenticatedSession) {
    await this.sessions.revoke(session.id, session.userId);
    return { revoked: true };
  }

  @Delete('sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke every session belonging to the caller' })
  @ApiResponse({
    status: 200,
    description: 'All active sessions for the caller were revoked.',
    example: { revoked: true },
  })
  @ApiResponse({
    status: 401,
    description: 'Bearer session is missing, expired, revoked, or inactive.',
    example: {
      statusCode: 401,
      message: 'A valid bearer session is required',
      error: 'Unauthorized',
    },
  })
  async revokeAllSessions(@CurrentSession() session: AuthenticatedSession) {
    await this.sessions.revokeAll(session.userId);
    return { revoked: true };
  }
}
