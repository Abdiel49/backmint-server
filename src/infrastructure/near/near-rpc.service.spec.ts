import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { NearRpcService } from './near-rpc.service.js';

const near = {
  network: 'testnet' as const,
  rpcUrl: 'https://rpc.testnet.near.org',
  contractId: 'backmint.testnet',
  contractVersion: '0.1.0',
  maxAttempts: 3,
  retryDelayMs: 0,
};

function createService() {
  const provider = {
    getNetworkId: vi.fn(),
    viewAccount: vi.fn(),
    viewTransactionStatus: vi.fn(),
  };

  return {
    provider,
    service: new NearRpcService(provider, near),
  };
}

describe('NearRpcService', () => {
  it('returns the configured contract identity after verifying the network', async () => {
    const { provider, service } = createService();
    provider.getNetworkId.mockResolvedValue('testnet');

    await expect(service.getNetworkIdentity()).resolves.toEqual({
      network: 'testnet',
      contractId: 'backmint.testnet',
      contractVersion: '0.1.0',
    });
  });

  it('rejects a network mismatch without retrying', async () => {
    const { provider, service } = createService();
    provider.getNetworkId.mockResolvedValue('mainnet');

    await expect(service.getNetworkIdentity()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(provider.getNetworkId).toHaveBeenCalledTimes(1);
  });

  it('reads contract state at finality', async () => {
    const { provider, service } = createService();
    const state = { block_height: 123 };
    provider.viewAccount.mockResolvedValue(state);

    await expect(service.getContractState()).resolves.toBe(state);
    expect(provider.viewAccount).toHaveBeenCalledWith({
      accountId: 'backmint.testnet',
      blockQuery: { finality: 'final' },
    });
  });

  it('reads transaction outcomes at finality', async () => {
    const { provider, service } = createService();
    const outcome = { final_execution_status: 'FINAL' };
    provider.viewTransactionStatus.mockResolvedValue(outcome);

    await expect(
      service.getTransactionOutcome('transaction-hash', 'signer.testnet'),
    ).resolves.toBe(outcome);
    expect(provider.viewTransactionStatus).toHaveBeenCalledWith({
      txHash: 'transaction-hash',
      accountId: 'signer.testnet',
      waitUntil: 'FINAL',
    });
  });

  it('retries transient RPC errors only up to the configured limit', async () => {
    const { provider, service } = createService();
    const state = { block_height: 123 };
    provider.viewAccount
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockRejectedValueOnce(new Error('503 service unavailable'))
      .mockResolvedValue(state);

    await expect(service.getContractState()).resolves.toBe(state);
    expect(provider.viewAccount).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-transient RPC errors', async () => {
    const { provider, service } = createService();
    provider.viewAccount.mockRejectedValue(new Error('invalid account'));

    await expect(service.getContractState()).rejects.toThrow('invalid account');
    expect(provider.viewAccount).toHaveBeenCalledTimes(1);
  });
});
