import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AuditPersistenceService } from './audit-persistence.service.js';

function createService() {
  const repository = {
    create: vi.fn((value) => value),
    save: vi.fn(async (value) => value),
    findOneBy: vi.fn(),
    createQueryBuilder: vi.fn(),
  };
  const manager = {
    queryRunner: { isTransactionActive: true as boolean },
    getRepository: vi.fn(() => repository),
    query: vi.fn(),
  };
  return {
    service: new AuditPersistenceService(),
    manager,
    repository,
  };
}

describe('AuditPersistenceService', () => {
  it('appends immutable audit data through the caller transaction manager', async () => {
    const { service, manager, repository } = createService();

    await service.appendAuditEvent(manager as never, {
      action: 'organization.member.invite',
      outcome: 'Allowed',
      targetType: 'Organization',
      targetId: 'organization-id',
      actor: { userId: 'user-id', organizationId: 'acting-org-id', membershipRole: 'Owner' },
      correlationId: 'request-123',
      afterHash: 'a'.repeat(64),
    });

    expect(manager.getRepository).toHaveBeenCalledOnce();
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'organization.member.invite',
        actorUserId: 'user-id',
        actingOrganizationId: 'acting-org-id',
        correlationId: 'request-123',
        afterHash: 'a'.repeat(64),
      }),
    );
  });

  it('atomically reserves an idempotency key with a canonical request hash', async () => {
    const { service, manager } = createService();
    manager.query.mockResolvedValue([{ id: 'reservation-id' }]);

    const result = await service.reserveIdempotency({
      manager: manager as never,
      scope: 'payment:create:user-id',
      key: 'request-key',
      request: { amount: 10, asset: 'USDC' },
    });

    expect(result).toEqual({ state: 'Reserved', id: 'reservation-id' });
    expect(manager.query.mock.calls[0][1]).toMatchObject([
      'payment:create:user-id',
      'request-key',
      expect.stringMatching(/^[a-f0-9]{64}$/),
      86_400,
    ]);
  });

  it('replays a completed response and rejects key reuse with another request', async () => {
    const { service, manager, repository } = createService();
    manager.query.mockResolvedValue([]);
    repository.findOneBy.mockResolvedValue({
      requestHash: createHash('sha256').update('{}').digest('hex'),
      state: 'Completed',
      response: { transactionId: 'tx-123' },
    });

    await expect(service.reserveIdempotency({
        manager: manager as never,
        scope: 'payout:create',
        key: 'same-key',
        request: {},
      })).resolves.toEqual({
      state: 'Replay',
      response: { transactionId: 'tx-123' },
    });

    repository.findOneBy.mockResolvedValue({
      requestHash: 'different-request-hash',
      state: 'Completed',
      response: { transactionId: 'tx-123' },
    });
    await expect(
      service.reserveIdempotency({
        manager: manager as never,
        scope: 'payout:create',
        key: 'same-key',
        request: {},
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses to complete a reservation that is no longer active', async () => {
    const { service, manager } = createService();
    manager.query.mockResolvedValue([]);

    await expect(
      service.completeIdempotency({
        manager: manager as never,
        id: 'reservation-id',
        requestHash: 'a'.repeat(64),
        response: { status: 'ok' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires an active transaction before persisting an audit event', async () => {
    const { service, manager } = createService();
    manager.queryRunner.isTransactionActive = false;

    await expect(
      service.appendAuditEvent(manager as never, {
        action: 'agreement.accept',
        outcome: 'Allowed',
        targetType: 'Agreement',
        targetId: 'agreement-id',
        actor: { userId: 'user-id' },
        correlationId: 'request-id',
      }),
    ).rejects.toThrow('Audit and idempotency records require an active transaction');
  });

  it('creates a traceable external integration record', async () => {
    const { service, manager, repository } = createService();

    await service.createExternalIntegration(manager as never, {
      provider: 'near-testnet',
      operation: 'agreement.register',
      idempotencyKey: 'operation-key',
      correlationId: 'request-id',
      request: { agreementId: 'agreement-id', amount: '1000000' },
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'near-testnet',
        operation: 'agreement.register',
        state: 'Pending',
        correlationId: 'request-id',
        requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it('rejects illegal external integration transitions and stale updates', async () => {
    const { service, manager } = createService();
    await expect(
      service.transitionExternalIntegration({
        manager: manager as never,
        id: 'operation-id',
        expectedState: 'Pending',
        nextState: 'Confirmed',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    manager.query.mockResolvedValue([]);
    await expect(
      service.transitionExternalIntegration({
        manager: manager as never,
        id: 'operation-id',
        expectedState: 'Submitted',
        nextState: 'Confirmed',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
