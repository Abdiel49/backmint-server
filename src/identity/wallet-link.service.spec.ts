import { createHash } from 'node:crypto';
import { KeyPairEd25519 } from 'near-api-js';
import { describe, expect, it, vi } from 'vitest';
import {
  encodeNep413Payload,
  WalletLinkService,
} from './wallet-link.service.js';

function createWalletService(claimAffected = 1) {
  const nonce = Buffer.alloc(32, 7);
  const challenge = {
    id: 'challenge-id',
    userId: 'user-id',
    accountId: 'alice.testnet',
    message: 'Link wallet to user',
    nonceHash: createHash('sha256').update(nonce).digest('hex'),
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
  };
  const savedChallenge = vi.fn(async (value) => value);
  const findChallenge = vi.fn(async () => challenge);
  const dataSource = {
    getRepository: vi.fn(() => ({
      save: savedChallenge,
      findOneBy: findChallenge,
      createQueryBuilder: vi.fn(),
    })),
    transaction: vi.fn(async (operation) => {
      const queryBuilder = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockReturnThis(),
        execute: vi.fn(async () => ({ affected: claimAffected })),
      };
      const manager = {
        createQueryBuilder: vi.fn(() => queryBuilder),
        create: vi.fn((_entity, value) => value),
        save: vi.fn(async (value) => value),
      };
      return operation(manager as never);
    }),
  };
  const nearRpc = { hasAccessKey: vi.fn(async () => true) };
  const service = new WalletLinkService(
    dataSource as never,
    nearRpc as never,
    { challengeRecipient: 'backmint-server', challengeTtlSeconds: 300 } as never,
  );

  return { service, challenge, nonce, dataSource, nearRpc, savedChallenge };
}

describe('encodeNep413Payload', () => {
  it('encodes the NEP-413 tag and Borsh payload fields', () => {
    const payload = encodeNep413Payload('hi', new Uint8Array(32), 'app');

    expect(payload.readUInt32LE(0)).toBe(2 ** 31 + 413);
    expect(payload.readUInt32LE(4)).toBe(2);
    expect(payload.subarray(8, 10).toString()).toBe('hi');
    expect(payload.subarray(10, 42)).toEqual(Buffer.alloc(32));
    expect(payload.readUInt32LE(42)).toBe(3);
    expect(payload.subarray(46, 49).toString()).toBe('app');
    expect(payload[49]).toBe(0);
  });

  it('rejects nonce values that do not contain 32 bytes', () => {
    expect(() => encodeNep413Payload('hi', new Uint8Array(31), 'app')).toThrow(
      'NEP-413 nonce must contain exactly 32 bytes',
    );
  });

  it('issues an expiring challenge and stores only the nonce hash', async () => {
    const { service, savedChallenge } = createWalletService();
    const challenge = await service.issueChallenge('user-id', 'alice.testnet');
    const persisted = savedChallenge.mock.calls[0][0];

    expect(challenge.nonce).toHaveLength(44);
    expect(challenge.recipient).toBe('backmint-server');
    expect(challenge.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(persisted.nonceHash).toHaveLength(64);
    expect(persisted.message).toContain('alice.testnet');
  });

  it('accepts a valid NEP-413 signature only when the key belongs to the account', async () => {
    const { service, challenge, nonce, nearRpc } = createWalletService();
    const keyPair = KeyPairEd25519.fromRandom();
    const digest = createHash('sha256')
      .update(encodeNep413Payload(challenge.message, nonce, 'backmint-server'))
      .digest();
    const signature = keyPair.sign(digest).signature;

    const link = await service.verifyAndLink('user-id', {
      challengeId: challenge.id,
      nonce: nonce.toString('base64'),
      publicKey: keyPair.publicKey.toString(),
      signature: Buffer.from(signature).toString('base64'),
    });

    expect(link).toMatchObject({
      userId: 'user-id',
      accountId: 'alice.testnet',
      publicKey: keyPair.publicKey.toString(),
    });
    expect(nearRpc.hasAccessKey).toHaveBeenCalledWith(
      'alice.testnet',
      keyPair.publicKey.toString(),
    );
  });

  it('rejects expired challenges and invalid signatures', async () => {
    const expired = createWalletService();
    expired.challenge.expiresAt = new Date(Date.now() - 1);
    await expect(
      expired.service.verifyAndLink('user-id', {
        challengeId: expired.challenge.id,
        nonce: expired.nonce.toString('base64'),
        publicKey: 'ed25519:invalid',
        signature: Buffer.alloc(64).toString('base64'),
      }),
    ).rejects.toThrow('Wallet challenge is invalid or expired');

    const invalid = createWalletService();
    const keyPair = KeyPairEd25519.fromRandom();
    await expect(
      invalid.service.verifyAndLink('user-id', {
        challengeId: invalid.challenge.id,
        nonce: invalid.nonce.toString('base64'),
        publicKey: keyPair.publicKey.toString(),
        signature: Buffer.alloc(64).toString('base64'),
      }),
    ).rejects.toThrow('Wallet signature is invalid');
  });

  it('rejects a challenge that another request has already claimed', async () => {
    const { service, challenge, nonce } = createWalletService(0);
    const keyPair = KeyPairEd25519.fromRandom();
    const digest = createHash('sha256')
      .update(encodeNep413Payload(challenge.message, nonce, 'backmint-server'))
      .digest();
    const signature = keyPair.sign(digest).signature;

    await expect(
      service.verifyAndLink('user-id', {
        challengeId: challenge.id,
        nonce: nonce.toString('base64'),
        publicKey: keyPair.publicKey.toString(),
        signature: Buffer.from(signature).toString('base64'),
      }),
    ).rejects.toThrow('Wallet challenge is invalid or expired');
  });
});
