import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { createIdempotencyRecord } from '../domain/events/event-primitives.js';
import { ChainOperationService } from './chain-operation.service.js';
import type { ChainOperationEntity } from './chain-operation.entity.js';
import { ChainOperationObservationEntity } from './chain-operation-observation.entity.js';

const input = {
  idempotencyKey: 'funding-intent-application-42-v1',
  operationType: 'RegisterAgreement',
  requestedBy: '2d2e0dd5-1fe3-4a2c-bc7a-bd3f74905b42',
  correlationId: 'request-8b3bb3f1',
  intent: {
    network: 'testnet',
    receiverId: 'escrow.backmint.testnet',
    methodName: 'register_agreement',
    argsBase64: 'eyJhZ3JlZW1lbnRfaWQiOiI0MiJ9',
    gas: '30000000000000',
    deposit: '0',
  },
};

function createHarness(reservation: {
  state: string;
  id?: string;
  response?: unknown;
}) {
  const operation = {
    id: 'a31d17ea-99e0-4626-a625-82975f742ad7',
    ...input,
    stateVersion: 1,
    payloadHash: 'a'.repeat(64),
    status: 'IntentReady',
    transactionHash: null,
    errorCode: null,
  } as unknown as ChainOperationEntity;
  const repository = {
    create: vi.fn((value) => value),
    save: vi.fn(async (value) => ({ ...value, id: operation.id })),
    findOneBy: vi.fn(async (): Promise<ChainOperationEntity | null> => null),
    findOneByOrFail: vi.fn(async () => operation),
  };
  const observationRepository = {
    create: vi.fn((value) => value),
    findOneBy: vi.fn(async () => null),
    findOneByOrFail: vi.fn(async (where) => ({
      id: 'observation-id',
      ...where,
    })),
  };
  const manager = {
    getRepository: vi.fn((entity) =>
      entity === ChainOperationObservationEntity
        ? observationRepository
        : repository,
    ),
    query: vi.fn(async () => [{ id: operation.id }]),
  };
  const dataSource = {
    transaction: vi.fn(async (callback) => callback(manager)),
    getRepository: vi.fn((entity) =>
      entity === ChainOperationObservationEntity
        ? observationRepository
        : repository,
    ),
  };
  const audit = {
    reserveIdempotency: vi.fn(async () => reservation),
    completeIdempotency: vi.fn(async () => undefined),
    appendAuditEvent: vi.fn(async () => undefined),
  };
  const nearRpc = {
    getNetworkIdentity: vi.fn(async () => ({
      network: input.intent.network,
      contractId: input.intent.receiverId,
      contractVersion: '1',
    })),
    getTransactionOutcome: vi.fn(async (transactionHash, signerAccountId) => ({
      transaction: { hash: transactionHash, signer_id: signerAccountId },
      transaction_outcome: { block_hash: 'final-block-hash' },
      status: { SuccessValue: '' },
    })),
  };
  return {
    service: new ChainOperationService(
      dataSource as never,
      audit as never,
      nearRpc as never,
    ),
    operation,
    repository,
    observationRepository,
    manager,
    dataSource,
    audit,
    nearRpc,
  };
}

describe('ChainOperationService', () => {
  it('creates and audits an unsigned intent exactly once', async () => {
    const harness = createHarness({ state: 'Reserved', id: 'reservation-id' });

    const result = await harness.service.createUnsignedIntent(input);

    expect(result.replayed).toBe(false);
    expect(result.operation.status).toBe('IntentReady');
    expect(result.operation.intent).toEqual(input.intent);
    expect(harness.audit.completeIdempotency).toHaveBeenCalledOnce();
    expect(harness.audit.appendAuditEvent).toHaveBeenCalledOnce();
  });

  it('resolves a retry to its existing operation without creating another intent', async () => {
    const harness = createHarness({
      state: 'Replay',
      response: { operationId: 'a31d17ea-99e0-4626-a625-82975f742ad7' },
    });
    harness.repository.findOneBy
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(harness.operation);

    const result = await harness.service.createUnsignedIntent(input);

    expect(result.replayed).toBe(true);
    expect(result.operation.id).toBe('a31d17ea-99e0-4626-a625-82975f742ad7');
    expect(harness.repository.save).not.toHaveBeenCalled();
  });

  it('resolves an operation after the idempotency reservation lifetime', async () => {
    const harness = createHarness({ state: 'Reserved', id: 'reservation-id' });
    harness.operation.payloadHash = createIdempotencyRecord({
      scope: 'chain-operation-payload',
      key: 'payload-hash',
      request: {
        operationType: input.operationType,
        intent: input.intent,
      },
    }).requestHash;
    harness.repository.findOneBy.mockResolvedValueOnce(harness.operation);

    const result = await harness.service.createUnsignedIntent(input);

    expect(result.replayed).toBe(true);
    expect(harness.audit.reserveIdempotency).not.toHaveBeenCalled();
  });

  it('rejects an intent targeting a different contract or network', async () => {
    const harness = createHarness({ state: 'Reserved', id: 'reservation-id' });

    await expect(
      harness.service.createUnsignedIntent({
        ...input,
        intent: { ...input.intent, receiverId: 'attacker.testnet' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects malformed unsigned call data', async () => {
    const harness = createHarness({ state: 'Reserved', id: 'reservation-id' });

    await expect(
      harness.service.createUnsignedIntent({
        ...input,
        intent: { ...input.intent, argsBase64: 'not base64' },
      }),
    ).rejects.toThrow('Contract arguments must be base64 encoded');
    expect(harness.nearRpc.getNetworkIdentity).not.toHaveBeenCalled();
  });

  it('rejects invalid lifecycle transitions before touching persistence', async () => {
    const harness = createHarness({ state: 'Reserved', id: 'reservation-id' });

    await expect(
      harness.service.transition({
        id: 'operation-id',
        expectedState: 'IntentReady',
        expectedVersion: 1,
        nextState: 'Confirmed',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('uses compare-and-swap state versions and records transitions in the audit log', async () => {
    const harness = createHarness({ state: 'Reserved', id: 'reservation-id' });
    harness.repository.findOneBy.mockResolvedValueOnce(harness.operation);

    await harness.service.transition({
      id: 'a31d17ea-99e0-4626-a625-82975f742ad7',
      expectedState: 'IntentReady',
      expectedVersion: 1,
      nextState: 'Submitted',
      transactionHash: '8qM2FfHqXoZ1aZyGmVYxT3U4p7o7JX8oCqWn4dD2hGv',
      signerAccountId: 'alice.testnet',
    });

    expect(harness.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('"stateVersion" = "stateVersion" + 1'),
      expect.arrayContaining(['IntentReady', 1, 'Submitted']),
    );
    expect(harness.audit.appendAuditEvent).toHaveBeenCalledOnce();
  });

  it('requires a signer account when an operation is marked submitted', async () => {
    const harness = createHarness({ state: 'Reserved', id: 'reservation-id' });

    await expect(
      harness.service.transition({
        id: input.requestedBy,
        expectedState: 'IntentReady',
        expectedVersion: 1,
        nextState: 'Submitted',
        transactionHash: 'tx-hash',
      }),
    ).rejects.toThrow('A submitted operation requires a NEAR signer account');
  });

  it('persists final RPC execution evidence without changing financial operation state', async () => {
    const harness = createHarness({ state: 'Reserved', id: 'reservation-id' });
    harness.operation.status = 'Submitted';
    harness.operation.transactionHash = 'final-tx-hash';
    harness.operation.signerAccountId = 'alice.testnet';
    harness.repository.findOneBy.mockResolvedValueOnce(harness.operation);
    harness.observationRepository.findOneByOrFail.mockResolvedValueOnce({
      id: 'observation-id',
      result: 'Succeeded',
      blockHash: 'final-block-hash',
    } as never);

    const result = await harness.service.reconcileFinalExecution(
      harness.operation.id,
    );

    expect(result.observation.result).toBe('Succeeded');
    expect(result.observation.blockHash).toBe('final-block-hash');
    expect(harness.nearRpc.getTransactionOutcome).toHaveBeenCalledWith(
      'final-tx-hash',
      'alice.testnet',
    );
    expect(harness.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO chain_operation_observations'),
      expect.arrayContaining(['Succeeded', 'final-block-hash']),
    );
    expect(harness.manager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE chain_operations'),
      expect.anything(),
    );
  });

  it('replays an existing execution observation without querying NEAR again', async () => {
    const harness = createHarness({ state: 'Reserved', id: 'reservation-id' });
    harness.operation.status = 'Unknown';
    harness.operation.transactionHash = 'final-tx-hash';
    harness.operation.signerAccountId = 'alice.testnet';
    harness.repository.findOneBy.mockResolvedValueOnce(harness.operation);
    const persisted = {
      id: 'observation-id',
      result: 'Failed',
      blockHash: 'final-block-hash',
    };
    harness.observationRepository.findOneBy.mockResolvedValueOnce(
      persisted as never,
    );

    const result = await harness.service.reconcileFinalExecution(
      harness.operation.id,
    );

    expect(result).toEqual({ observation: persisted, replayed: true });
    expect(harness.nearRpc.getTransactionOutcome).not.toHaveBeenCalled();
  });

  it('rejects a final result whose signer does not match the submitted operation', async () => {
    const harness = createHarness({ state: 'Reserved', id: 'reservation-id' });
    harness.operation.status = 'Submitted';
    harness.operation.transactionHash = 'final-tx-hash';
    harness.operation.signerAccountId = 'alice.testnet';
    harness.repository.findOneBy.mockResolvedValueOnce(harness.operation);
    harness.nearRpc.getTransactionOutcome.mockResolvedValueOnce({
      transaction: { hash: 'final-tx-hash', signer_id: 'mallory.testnet' },
      transaction_outcome: { block_hash: 'final-block-hash' },
      status: { SuccessValue: '' },
    } as never);

    await expect(
      harness.service.reconcileFinalExecution(harness.operation.id),
    ).rejects.toThrow('NEAR returned a transaction that does not match');
  });

  it('does not persist a non-final NEAR execution result', async () => {
    const harness = createHarness({ state: 'Reserved', id: 'reservation-id' });
    harness.operation.status = 'Unknown';
    harness.operation.transactionHash = 'final-tx-hash';
    harness.operation.signerAccountId = 'alice.testnet';
    harness.repository.findOneBy.mockResolvedValueOnce(harness.operation);
    harness.nearRpc.getTransactionOutcome.mockResolvedValueOnce({
      transaction: { hash: 'final-tx-hash', signer_id: 'alice.testnet' },
      transaction_outcome: { block_hash: 'observed-block-hash' },
      status: 'Started',
    } as never);

    await expect(
      harness.service.reconcileFinalExecution(harness.operation.id),
    ).rejects.toThrow('NEAR has not returned a final execution result');
    expect(harness.manager.query).not.toHaveBeenCalled();
  });
});
