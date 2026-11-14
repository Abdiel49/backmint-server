import { ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { OrganizationType } from './organization.entity.js';
import { OrganizationService } from './organization.service.js';

function createService() {
  const repository = {
    create: vi.fn((value) => value),
    save: vi.fn(),
  };
  return {
    service: new OrganizationService(repository as never),
    repository,
  };
}

describe('OrganizationService', () => {
  it('normalizes organization input and assigns ownership from authenticated context', async () => {
    const { service, repository } = createService();
    repository.save.mockImplementation(async (value) => ({
      id: 'organization-1',
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
    const { service, repository } = createService();
    const databaseError = Object.assign(new Error('duplicate'), {
      code: '23505',
    });
    repository.save.mockRejectedValue(
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
