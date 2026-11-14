import { AuthSessionController } from './auth-session.controller.js';
import { AuthSessionService } from './auth-session.service.js';

describe('AuthSessionController', () => {
  it('returns only the authenticated session context', () => {
    const controller = new AuthSessionController({} as AuthSessionService);

    expect(
      controller.getCurrentSession({ id: 'session-1', userId: 'user-1' }),
    ).toEqual({ sessionId: 'session-1', userId: 'user-1' });
  });

  it('revokes only the current session for the current user', async () => {
    const revoke = vi.fn().mockResolvedValue(undefined);
    const sessions = {
      revoke,
    } as unknown as AuthSessionService;
    const controller = new AuthSessionController(sessions);

    await expect(
      controller.revokeCurrentSession({ id: 'session-1', userId: 'user-1' }),
    ).resolves.toEqual({ revoked: true });
    expect(revoke).toHaveBeenCalledWith('session-1', 'user-1');
  });

  it('revokes every session only for the current user', async () => {
    const revokeAll = vi.fn().mockResolvedValue(undefined);
    const sessions = {
      revokeAll,
    } as unknown as AuthSessionService;
    const controller = new AuthSessionController(sessions);

    await expect(
      controller.revokeAllSessions({ id: 'session-1', userId: 'user-1' }),
    ).resolves.toEqual({ revoked: true });
    expect(revokeAll).toHaveBeenCalledWith('user-1');
  });
});
