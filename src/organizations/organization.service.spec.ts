import { ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { OrganizationType } from './organization.entity.js';
import { OrganizationService } from './organization.service.js';
import { OrganizationEntity } from './organization.entity.js';

function createService() {
  const organizations = {
    create: vi.fn((value) => value),
    save: vi.fn(),
  };
  const memberships = { create: vi.fn((value) => value), save: vi.fn() };
  const dataSource = {
    transaction: vi.fn(async (callback) =>
      callback({
        getRepository: (entity) =>
          entity === OrganizationEntity ? organizations : memberships,
      }),
    ),
  };
  return {
    service: new OrganizationService(dataSource as never),
    organizations,
    memberships,
  };
}

describe('OrganizationService', () => {
  it('normalizes organization input and assigns ownership from authenticated context', async () => {
    const { service, organizations, memberships } = createService();
    organizations.save.mockImplementation(async (value) => ({
      id: 'organization-1',
      createdAt: new Date('2026-11-14T00:00:00.000Z'),
      ...value,
    }));

    await expect(
      service.create('user-1', {
        slug: '  Green-Team ',
        name: ' Green Team ',
        organizationType: OrganizationType.Community,
        country: 'bo',
        legalStatus: 'Informal',
      }),
    ).resolves.toMatchObject({
      slug: 'green-team',
      name: 'Green Team',
      country: 'BO',
      ownerUserId: 'user-1',
      visibility: 'Private',
      status: 'Active',
    });
    expect(memberships.save).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'organization-1',
        userId: 'user-1',
        role: 'Owner',
        status: 'Active',
      }),
    );
  });

  it('rejects missing owner context', async () => {
    const { service } = createService();

    await expect(
      service.create('', {
        slug: 'org',
        name: 'Org',
        organizationType: OrganizationType.Community,
        country: 'US',
        legalStatus: 'Informal',
      }),
    ).rejects.toThrow(TypeError);
  });

  it('maps the database slug constraint to a conflict', async () => {
    const { service, organizations } = createService();
    const databaseError = Object.assign(new Error('duplicate'), {
      code: '23505',
    });
    organizations.save.mockRejectedValue(
      new QueryFailedError('INSERT', [], databaseError),
    );

    await expect(
      service.create('user-1', {
        slug: 'taken',
        name: 'Taken',
        organizationType: OrganizationType.Company,
        country: 'US',
        legalStatus: 'Incorporated',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
