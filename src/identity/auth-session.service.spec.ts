import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthSessionService } from './auth-session.service.js';
import { UserStatus } from './user.entity.js';

function createService() {
  const sessions = {
    create: vi.fn((value) => value),
    save: vi.fn(async (value) => value),
    findOne: vi.fn(),
    update: vi.fn(),
    createQueryBuilder: vi.fn(),
  };
  const identities = { findOne: vi.fn() };
  const service = new AuthSessionService(
    sessions as never,
    identities as never,
    { sessionTtlSeconds: 600 } as never,
  );

  return { service, sessions, identities };
}

describe('AuthSessionService', () => {
  it('creates a hashed, expiring session for a verified active identity', async () => {
    const { service, sessions, identities } = createService();
    identities.findOne.mockResolvedValue({
      id: 'identity-id',
      userId: 'user-id',
      verifiedAt: new Date(),
      user: { status: UserStatus.Active },
    });

    const result = await service.createForVerifiedIdentity('identity-id');
    const persisted = sessions.create.mock.calls[0][0];

    expect(result.token).toHaveLength(43);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(persisted.userId).toBe('user-id');
    expect(persisted.tokenHash).not.toBe(result.token);
    expect(persisted.tokenHash).toHaveLength(64);
  });

  it('rejects unverified or inactive identities', async () => {
    const { service, identities } = createService();
    identities.findOne.mockResolvedValue({
      verifiedAt: null,
      user: { status: UserStatus.Active },
    });

    await expect(
      service.createForVerifiedIdentity('identity-id'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('authenticates active sessions and records last use', async () => {
    const { service, sessions } = createService();
    sessions.findOne.mockResolvedValue({
      id: 'session-id',
      userId: 'user-id',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: { status: UserStatus.Active },
    });

    await expect(service.authenticate('opaque-token')).resolves.toEqual({
      id: 'session-id',
      userId: 'user-id',
    });
    expect(sessions.update).toHaveBeenCalledWith(
      { id: 'session-id' },
      expect.objectContaining({ lastUsedAt: expect.any(Date) }),
    );
  });

  it('rejects expired, revoked, inactive, and oversized tokens', async () => {
    const { service, sessions } = createService();
    sessions.findOne.mockResolvedValue({
      expiresAt: new Date(Date.now() - 1),
      revokedAt: null,
      user: { status: UserStatus.Active },
    });

    await expect(service.authenticate('expired')).resolves.toBeNull();
    await expect(service.authenticate('a'.repeat(129))).resolves.toBeNull();
    expect(sessions.findOne).toHaveBeenCalledTimes(1);
  });
});
