import { BadRequestException, ConflictException } from '@nestjs/common';
import { AwardsService } from './awards.service.js';

describe('AwardsService', () => {
  it('requires positive integer base-unit allocations', async () => {
    const service = new AwardsService({} as never);
    await expect(
      service.createFromApplication({
        applicationId: 'application-id',
        allocation: '1.5',
        asset: 'near:testnet:token',
        expiresAt: new Date(Date.now() + 60_000),
        actorUserId: 'owner-id',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a second transition after reservation release', async () => {
    const manager = {
      getRepository: () => ({
        findOne: async () => ({
          id: 'award-id',
          sourceType: 'Project',
          sourceId: 'source-id',
          recipientUserId: 'recipient-id',
          state: 'Declined',
          releasedAt: new Date(),
        }),
      }),
      query: async () => [],
    };
    const service = new AwardsService({
      transaction: (callback: (value: unknown) => unknown) => callback(manager),
    } as never);
    await expect(
      service.accept('award-id', 'recipient-id'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
