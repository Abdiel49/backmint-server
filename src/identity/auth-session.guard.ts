import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { type Request } from 'express';
import { AuthSessionService, type AuthenticatedSession } from './auth-session.service.js';

type AuthenticatedRequest = Request & { authSession?: AuthenticatedSession };

@Injectable()
export class AuthSessionGuard implements CanActivate {
  constructor(private readonly sessions: AuthSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : '';
    const session = await this.sessions.authenticate(token);

    if (!session) {
      throw new UnauthorizedException('A valid bearer session is required');
    }

    request.authSession = session;
    return true;
  }
}

export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedSession => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.authSession) {
      throw new UnauthorizedException('Authenticated session is unavailable');
    }

    return request.authSession;
  },
);
