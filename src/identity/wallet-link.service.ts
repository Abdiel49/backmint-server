import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { KeyType, PublicKey } from 'near-api-js';
import { DataSource, IsNull } from 'typeorm';
import { walletConfig } from '../config/configuration.js';
import { NearRpcService } from '../infrastructure/near/near-rpc.service.js';
import { WalletChallengeEntity } from './wallet-challenge.entity.js';
import { WalletLinkEntity } from './wallet-link.entity.js';

const NEP413_TAG = 2 ** 31 + 413;

export type WalletChallenge = {
  id: string;
  message: string;
  nonce: string;
  recipient: string;
  network: string;
  expiresAt: Date;
};

export type VerifyWalletInput = {
  challengeId: string;
  nonce: string;
  signature: string;
  publicKey: string;
};

@Injectable()
export class WalletLinkService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly nearRpc: NearRpcService,
    @Inject(walletConfig.KEY)
    private readonly wallet: ConfigType<typeof walletConfig>,
  ) {}

  async issueChallenge(
    userId: string,
    accountId: string,
  ): Promise<WalletChallenge> {
    if (!userId.trim() || !this.isValidAccountId(accountId)) {
      throw new TypeError('A valid userId and NEAR accountId are required');
    }

    const id = randomUUID();
    const nonceBytes = randomBytes(32);
    const nonce = nonceBytes.toString('base64');
    const expiresAt = new Date(
      Date.now() + this.wallet.challengeTtlSeconds * 1000,
    );
    const message = `Link NEAR account ${accountId} to Backmint user ${userId}. Challenge ${id}. Expires ${expiresAt.toISOString()}.`;

    await this.dataSource.getRepository(WalletChallengeEntity).save({
      id,
      userId,
      accountId,
      message,
      nonceHash: createHash('sha256').update(nonceBytes).digest('hex'),
      expiresAt,
      usedAt: null,
    });

    return {
      id,
      message,
      nonce,
      recipient: this.wallet.challengeRecipient,
      network: this.wallet.network,
      expiresAt,
    };
  }

  async verifyAndLink(
    userId: string,
    input: VerifyWalletInput,
  ): Promise<WalletLinkEntity> {
    const challenge = await this.dataSource
      .getRepository(WalletChallengeEntity)
      .findOneBy({ id: input.challengeId, userId });

    if (!challenge || challenge.usedAt || challenge.expiresAt <= new Date()) {
      throw new UnauthorizedException('Wallet challenge is invalid or expired');
    }

    let publicKey: PublicKey;
    let signature: Uint8Array;
    try {
      publicKey = PublicKey.fromString(input.publicKey);
      signature = Buffer.from(input.signature, 'base64');
      if (publicKey.keyType !== KeyType.ED25519 || signature.length !== 64) {
        throw new Error('Invalid NEP-413 signature encoding');
      }
    } catch {
      throw new UnauthorizedException('Wallet signature is invalid');
    }

    const nonce = Buffer.from(input.nonce, 'base64');
    if (nonce.length !== 32) {
      throw new UnauthorizedException('Wallet challenge nonce is invalid');
    }
    const nonceHash = createHash('sha256').update(nonce).digest('hex');
    if (nonceHash !== challenge.nonceHash) {
      throw new UnauthorizedException('Wallet challenge nonce is invalid');
    }

    const payload = encodeNep413Payload(
      challenge.message,
      nonce,
      this.wallet.challengeRecipient,
    );
    const digest = createHash('sha256').update(payload).digest();

    if (!publicKey.verify(digest, signature)) {
      throw new UnauthorizedException('Wallet signature is invalid');
    }
    if (
      !(await this.nearRpc.hasFullAccessKey(
        challenge.accountId,
        input.publicKey,
      ))
    ) {
      throw new UnauthorizedException(
        'Signing key does not have full account access',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const claimed = await manager
        .createQueryBuilder()
        .update(WalletChallengeEntity)
        .set({ usedAt: new Date() })
        .where(
          'id = :id AND "userId" = :userId AND "usedAt" IS NULL AND "expiresAt" > NOW()',
          {
            id: challenge.id,
            userId,
          },
        )
        .returning('id')
        .execute();

      if (claimed.affected !== 1) {
        throw new UnauthorizedException(
          'Wallet challenge is invalid or expired',
        );
      }

      try {
        const link = manager.create(WalletLinkEntity, {
          userId,
          accountId: challenge.accountId,
          network: this.wallet.network,
          publicKey: input.publicKey,
          verifiedAt: new Date(),
          revokedAt: null,
        });
        return await manager.save(link);
      } catch (error) {
        throw new ConflictException(
          'NEAR account already has an active wallet link',
          {
            cause: error,
          },
        );
      }
    });
  }

  async revoke(userId: string, walletLinkId: string): Promise<void> {
    const result = await this.dataSource
      .getRepository(WalletLinkEntity)
      .createQueryBuilder()
      .update(WalletLinkEntity)
      .set({ revokedAt: new Date() })
      .where(
        'id = :walletLinkId AND "userId" = :userId AND "revokedAt" IS NULL',
        {
          walletLinkId,
          userId,
        },
      )
      .execute();

    if (result.affected !== 1) {
      throw new ConflictException('Active wallet link was not found');
    }
  }

  async listActiveLinks(userId: string): Promise<WalletLinkEntity[]> {
    return this.dataSource.getRepository(WalletLinkEntity).find({
      where: { userId, revokedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  private isValidAccountId(accountId: string): boolean {
    return (
      accountId.length >= 2 &&
      accountId.length <= 64 &&
      /^(?:[a-z0-9]+[._-])*[a-z0-9]+$/.test(accountId)
    );
  }
}

export function encodeNep413Payload(
  message: string,
  nonce: Uint8Array,
  recipient: string,
): Buffer {
  if (nonce.length !== 32) {
    throw new TypeError('NEP-413 nonce must contain exactly 32 bytes');
  }

  const encodeString = (value: string) => {
    const bytes = Buffer.from(value, 'utf8');
    const length = Buffer.alloc(4);
    length.writeUInt32LE(bytes.length);
    return Buffer.concat([length, bytes]);
  };
  const tag = Buffer.alloc(4);
  tag.writeUInt32LE(NEP413_TAG);

  return Buffer.concat([
    tag,
    encodeString(message),
    Buffer.from(nonce),
    encodeString(recipient),
    Buffer.from([0]),
  ]);
}
