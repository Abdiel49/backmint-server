import {
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { type JsonRpcProvider } from 'near-api-js';
import { nearConfig } from '../../config/configuration.js';
import { NEAR_RPC_PROVIDER } from './near.constants.js';

type NearRpcProvider = Pick<
  JsonRpcProvider,
  'getNetworkId' | 'viewAccount' | 'viewTransactionStatus' | 'viewAccessKeyList'
>;

export type NearContractState = Awaited<
  ReturnType<NearRpcProvider['viewAccount']>
>;

export type NearTransactionOutcome = Awaited<
  ReturnType<NearRpcProvider['viewTransactionStatus']>
>;

export interface NearNetworkIdentity {
  network: string;
  contractId: string;
  contractVersion: string;
}

@Injectable()
export class NearRpcService {
  constructor(
    @Inject(NEAR_RPC_PROVIDER)
    private readonly provider: NearRpcProvider,
    @Inject(nearConfig.KEY)
    private readonly near: ConfigType<typeof nearConfig>,
  ) {}

  getNetworkIdentity(): Promise<NearNetworkIdentity> {
    return this.withRetry(async () => {
      const network = await this.provider.getNetworkId();

      if (network !== this.near.network) {
        throw new ServiceUnavailableException(
          `NEAR RPC network mismatch: expected ${this.near.network}, received ${network}`,
        );
      }

      return {
        network,
        contractId: this.near.contractId,
        contractVersion: this.near.contractVersion,
      };
    });
  }

  getContractState(): Promise<NearContractState> {
    return this.withRetry(() =>
      this.provider.viewAccount({
        accountId: this.near.contractId,
        blockQuery: { finality: 'final' },
      }),
    );
  }

  getTransactionOutcome(
    transactionHash: string,
    signerAccountId: string,
  ): Promise<NearTransactionOutcome> {
    return this.withRetry(() =>
      this.provider.viewTransactionStatus({
        txHash: transactionHash,
        accountId: signerAccountId,
        waitUntil: 'FINAL',
      }),
    );
  }

  async hasAccessKey(accountId: string, publicKey: string): Promise<boolean> {
    return this.withRetry(async () => {
      const result = await this.provider.viewAccessKeyList({ accountId });
      return result.keys.some((key) => key.public_key.toString() === publicKey);
    });
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.near.maxAttempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (!this.isRetryable(error) || attempt === this.near.maxAttempts) {
          throw error;
        }

        await this.wait(this.near.retryDelayMs);
      }
    }

    throw lastError;
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof HttpException || !(error instanceof Error)) {
      return false;
    }

    return /429|502|503|504|econnreset|econnrefused|fetch|network|socket|timeout|temporary/i.test(
      error.message,
    );
  }

  private wait(delayMs: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }
}
