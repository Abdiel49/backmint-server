import { ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { IdentityProviderType } from './identity-provider.entity.js';
import { IdentityService } from './identity.service.js';

function createService() {
  const users = {
    create: vi.fn((value) => value),
    save: vi.fn(),
  };
  const identityProviders = {
    create: vi.fn((value) => value),
    save: vi.fn(),
  };

  return {
    service: new IdentityService(users as never, identityProviders as never),
    users,
    identityProviders,
  };
}

describe('IdentityService', () => {
  it('normalizes user registration data and applies safe defaults', async () => {
    const { service, users } = createService();
    users.save.mockImplementation(async (user) => user);

    await expect(
      service.registerUser({
        email: '  Person@Example.COM ',
        displayName: ' Person ',
      }),
    ).resolves.toMatchObject({
      email: 'person@example.com',
      displayName: 'Person',
      locale: 'en',
      status: 'Active',
    });
  });

  it('rejects invalid email, locale and blank display name', async () => {
    const { service } = createService();

    await expect(
      service.registerUser({ email: 'bad', displayName: 'Person' }),
    ).rejects.toThrow(TypeError);
    await expect(
      service.registerUser({ displayName: 'Person', locale: '../admin' }),
    ).rejects.toThrow(TypeError);
    await expect(
      service.registerUser({ displayName: '  ' }),
    ).rejects.toThrow(TypeError);
  });

  it('maps unique email constraint violations to a conflict', async () => {
    const { service, users } = createService();
    const driverError = Object.assign(new Error('duplicate'), {
      code: '23505',
    });
    users.save.mockRejectedValue(
      new QueryFailedError('INSERT', [], driverError),
    );

    await expect(
      service.registerUser({
        email: 'person@example.com',
        displayName: 'Person',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('links only identities with explicit verified timestamps', async () => {
    const { service, identityProviders } = createService();
    identityProviders.save.mockImplementation(async (identity) => identity);
    const verifiedAt = new Date('2026-11-14T00:00:00.000Z');

    await expect(
      service.linkVerifiedIdentity(
        'user-1',
        IdentityProviderType.Google,
        'google-subject-1',
        verifiedAt,
      ),
    ).resolves.toMatchObject({
      userId: 'user-1',
      provider: 'Google',
      subject: 'google-subject-1',
      verifiedAt,
    });
    await expect(
      service.linkVerifiedIdentity(
        'user-1',
        IdentityProviderType.Google,
        'google-subject-1',
        new Date('invalid'),
      ),
    ).rejects.toThrow(TypeError);
  });
});
