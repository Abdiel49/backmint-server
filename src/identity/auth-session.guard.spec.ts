import { UnauthorizedException } from '@nestjs/common';
import { AuthSessionGuard } from './auth-session.guard.js';
import { AuthSessionService } from './auth-session.service.js';

describe('AuthSessionGuard', () => {
  function context(headers: Record<string, string>) {
    const request = { headers };
    return {
      request,
      executionContext: {
        switchToHttp: () => ({ getRequest: () => request }),
      } as never,
    };
  }

  it('rejects requests without a bearer token, including cookie-only requests', async () => {
    const authenticate = vi.fn();
    const sessions = { authenticate } as unknown as AuthSessionService;
    const guard = new AuthSessionGuard(sessions);
    const { executionContext } = context({ cookie: 'session=opaque-token' });

    await expect(guard.canActivate(executionContext)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authenticate).toHaveBeenCalledWith('');
  });

  it('rejects expired or revoked bearer sessions', async () => {
    const authenticate = vi.fn().mockResolvedValue(null);
    const sessions = {
      authenticate,
    } as unknown as AuthSessionService;
    const guard = new AuthSessionGuard(sessions);
    const { executionContext } = context({ authorization: 'Bearer stale' });

    await expect(guard.canActivate(executionContext)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches the authenticated session for downstream resource checks', async () => {
    const authenticate = vi
      .fn()
      .mockResolvedValue({ id: 'session-1', userId: 'user-1' });
    const sessions = {
      authenticate,
    } as unknown as AuthSessionService;
    const guard = new AuthSessionGuard(sessions);
    const { executionContext, request } = context({
      authorization: 'Bearer valid',
    });

    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
    expect(request).toHaveProperty('authSession', {
      id: 'session-1',
      userId: 'user-1',
    });
  });
});
