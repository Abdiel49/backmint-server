import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditPersistenceService } from '../audit/audit-persistence.service.js';
import { createIdempotencyRecord } from '../domain/events/event-primitives.js';
import { NearRpcService } from '../infrastructure/near/near-rpc.service.js';
import { ChainOperationObservationEntity } from './chain-operation-observation.entity.js';
import {
  ChainOperationEntity,
  type ChainOperationStatus,
  type UnsignedContractCallIntent,
} from './chain-operation.entity.js';

export type CreateChainOperationInput = {
  idempotencyKey: string;
  operationType: string;
  requestedBy: string;
  correlationId: string;
  intent: UnsignedContractCallIntent;
};

const allowedTransitions: Record<ChainOperationStatus, ChainOperationStatus[]> =
  {
    IntentReady: ['Submitted', 'Failed', 'Unknown'],
    Submitted: ['Confirmed', 'Failed', 'Unknown'],
    Confirmed: [],
    Failed: [],
    Unknown: ['Confirmed', 'Failed'],
  };

@Injectable()
export class ChainOperationService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditPersistenceService,
    private readonly nearRpc: NearRpcService,
  ) {}

  async createUnsignedIntent(input: CreateChainOperationInput): Promise<{
    operation: ChainOperationEntity;
    replayed: boolean;
  }> {
    this.validateInput(input);
    const networkIdentity = await this.nearRpc.getNetworkIdentity();
    if (
      input.intent.network !== networkIdentity.network ||
      input.intent.receiverId !== networkIdentity.contractId
    ) {
      throw new ConflictException(
        'Unsigned intent does not match configured NEAR contract and network',
      );
    }
    const payloadHash = createIdempotencyRecord({
      scope: 'chain-operation-payload',
      key: 'payload-hash',
      request: {
        operationType: input.operationType,
        intent: input.intent as unknown as Record<string, never>,
      },
    }).requestHash;
    const idempotencyRequest = {
      operationType: input.operationType,
      requestedBy: input.requestedBy,
      intent: input.intent as unknown as Record<string, never>,
    };
    const idempotencyRequestHash = createIdempotencyRecord({
      scope: `chain-operation:${input.requestedBy}`,
      key: input.idempotencyKey,
      request: idempotencyRequest,
    }).requestHash;

    return this.dataSource.transaction(async (manager) => {
      const existingOperation = await manager
        .getRepository(ChainOperationEntity)
        .findOneBy({
          requestedBy: input.requestedBy,
          idempotencyKey: input.idempotencyKey,
        });
      if (existingOperation) {
        if (existingOperation.payloadHash !== payloadHash) {
          throw new ConflictException(
            'Idempotency key was reused with a different operation payload',
          );
        }
        return { operation: existingOperation, replayed: true };
      }

      const reservation = await this.audit.reserveIdempotency({
        manager,
        scope: `chain-operation:${input.requestedBy}`,
        key: input.idempotencyKey,
        request: idempotencyRequest,
      });

      if (reservation.state === 'Replay') {
        const response = reservation.response as { operationId?: string };
        if (!response?.operationId) {
          throw new ConflictException(
            'Idempotent operation has no recoverable reference',
          );
        }
        const operation = await manager
          .getRepository(ChainOperationEntity)
          .findOneBy({
            id: response.operationId,
            requestedBy: input.requestedBy,
          });
        if (!operation) {
          throw new ConflictException('Idempotent operation record is missing');
        }
        return { operation, replayed: true };
      }
      if (reservation.state === 'InProgress') {
        throw new ConflictException('Operation is already being initialized');
      }

      const repository = manager.getRepository(ChainOperationEntity);
      const operation = await repository.save(
        repository.create({
          ...input,
          stateVersion: 1,
          payloadHash,
          status: 'IntentReady',
          transactionHash: null,
          errorCode: null,
        }),
      );
      await this.audit.completeIdempotency({
        manager,
        id: reservation.id,
        requestHash: idempotencyRequestHash,
        response: { operationId: operation.id },
      });
      await this.audit.appendAuditEvent(manager, {
        action: 'chain_operation.intent_created',
        outcome: 'Allowed',
        targetType: 'ChainOperation',
        targetId: operation.id,
        actor: { userId: input.requestedBy },
        correlationId: input.correlationId,
        afterHash: payloadHash,
      });
      return { operation, replayed: false };
    });
  }

  async getById(
    id: string,
    requestedBy: string,
  ): Promise<ChainOperationEntity> {
    const operation = await this.dataSource
      .getRepository(ChainOperationEntity)
      .findOneBy({ id, requestedBy });
    if (!operation) {
      throw new NotFoundException('Chain operation was not found');
    }
    return operation;
  }

  async transition(input: {
    id: string;
    expectedState: ChainOperationStatus;
    expectedVersion: number;
    nextState: ChainOperationStatus;
    transactionHash?: string;
    signerAccountId?: string;
    errorCode?: string;
  }): Promise<ChainOperationEntity> {
    if (!allowedTransitions[input.expectedState].includes(input.nextState)) {
      throw new ConflictException(
        `Chain operation cannot move from ${input.expectedState} to ${input.nextState}`,
      );
    }
    if (input.nextState === 'Submitted' && !input.transactionHash) {
      throw new TypeError('A submitted operation requires a transaction hash');
    }
    if (input.nextState === 'Submitted' && !input.signerAccountId?.trim()) {
      throw new TypeError(
        'A submitted operation requires a NEAR signer account',
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager
        .getRepository(ChainOperationEntity)
        .findOneBy({ id: input.id });
      if (!existing) {
        throw new NotFoundException('Chain operation was not found');
      }
      const rows = (await manager.query(
        `UPDATE chain_operations
          SET status = $4, "stateVersion" = "stateVersion" + 1,
              "transactionHash" = COALESCE($5, "transactionHash"),
              "errorCode" = $6,
              "signerAccountId" = COALESCE($7, "signerAccountId"),
              "updatedAt" = NOW()
        WHERE id = $1 AND status = $2 AND "stateVersion" = $3
        RETURNING id`,
        [
          input.id,
          input.expectedState,
          input.expectedVersion,
          input.nextState,
          input.transactionHash ?? null,
          input.errorCode ?? null,
          input.signerAccountId ?? null,
        ],
      )) as Array<{ id: string }>;
      if (rows.length !== 1) {
        throw new ConflictException(
          'Chain operation state changed concurrently',
        );
      }
      await this.audit.appendAuditEvent(manager, {
        action: 'chain_operation.transitioned',
        outcome: 'Allowed',
        targetType: 'ChainOperation',
        targetId: input.id,
        actor: { userId: existing.requestedBy },
        correlationId: existing.correlationId,
        beforeHash: String(input.expectedVersion),
        afterHash: String(input.expectedVersion + 1),
        reasonCode: input.errorCode,
      });
      return manager
        .getRepository(ChainOperationEntity)
        .findOneByOrFail({ id: input.id });
    });
  }

  async reconcileFinalExecution(id: string): Promise<{
    observation: ChainOperationObservationEntity;
    replayed: boolean;
  }> {
    const operation = await this.dataSource
      .getRepository(ChainOperationEntity)
      .findOneBy({ id });
    if (!operation) {
      throw new NotFoundException('Chain operation was not found');
    }
    if (!['Submitted', 'Unknown'].includes(operation.status)) {
      throw new ConflictException(
        'Only submitted or unknown operations can be reconciled',
      );
    }
    if (!operation.transactionHash || !operation.signerAccountId) {
      throw new ConflictException(
        'Operation is missing its submitted transaction and signer binding',
      );
    }
    const transactionHash = operation.transactionHash;
    const signerAccountId = operation.signerAccountId;
    const repository = this.dataSource.getRepository(
      ChainOperationObservationEntity,
    );
    const existing = await repository.findOneBy({
      chainOperationId: id,
      transactionHash,
    });
    if (existing) {
      return { observation: existing, replayed: true };
    }

    const identity = await this.nearRpc.getNetworkIdentity();
    if (identity.network !== operation.intent.network) {
      throw new ConflictException(
        'Chain operation network does not match the configured NEAR network',
      );
    }
    const outcome = await this.nearRpc.getTransactionOutcome(
      transactionHash,
      signerAccountId,
    );
    if (
      outcome.transaction.hash !== transactionHash ||
      outcome.transaction.signer_id !== signerAccountId
    ) {
      throw new ConflictException(
        'NEAR returned a transaction that does not match the submitted operation',
      );
    }
    const status = outcome.status;
    const result =
      typeof status === 'object' && 'Failure' in status
        ? 'Failed'
        : typeof status === 'object' &&
            ('SuccessValue' in status || 'SuccessReceiptId' in status)
          ? 'Succeeded'
          : null;
    if (!result) {
      throw new ConflictException(
        'NEAR has not returned a final execution result for this transaction',
      );
    }
    const executionStatus =
      typeof status === 'string' ? status : (status as Record<string, unknown>);
    const observation = repository.create({
      chainOperationId: id,
      network: identity.network,
      transactionHash: outcome.transaction.hash,
      signerAccountId: outcome.transaction.signer_id,
      result,
      blockHash: outcome.transaction_outcome.block_hash,
      executionStatus,
    });

    return this.dataSource.transaction(async (manager) => {
      const inserted = (await manager.query(
        `INSERT INTO chain_operation_observations
          ("chainOperationId", network, "transactionHash", "signerAccountId", result, "blockHash", "executionStatus")
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT ("chainOperationId", "transactionHash") DO NOTHING
         RETURNING id`,
        [
          observation.chainOperationId,
          observation.network,
          observation.transactionHash,
          observation.signerAccountId,
          observation.result,
          observation.blockHash,
          JSON.stringify(observation.executionStatus),
        ],
      )) as Array<{ id: string }>;
      const persisted = await manager
        .getRepository(ChainOperationObservationEntity)
        .findOneByOrFail({
          chainOperationId: id,
          transactionHash,
        });
      if (inserted.length === 1) {
        await this.audit.appendAuditEvent(manager, {
          action: 'chain_operation.final_execution_observed',
          outcome: 'Allowed',
          targetType: 'ChainOperation',
          targetId: id,
          actor: { userId: operation.requestedBy },
          correlationId: operation.correlationId,
          afterHash: persisted.blockHash,
          reasonCode: persisted.result,
        });
      }
      return { observation: persisted, replayed: inserted.length === 0 };
    });
  }

  private validateInput(input: CreateChainOperationInput): void {
    for (const [name, value] of Object.entries({
      idempotencyKey: input.idempotencyKey,
      operationType: input.operationType,
      requestedBy: input.requestedBy,
      correlationId: input.correlationId,
      network: input.intent.network,
      receiverId: input.intent.receiverId,
      methodName: input.intent.methodName,
      argsBase64: input.intent.argsBase64,
      gas: input.intent.gas,
      deposit: input.intent.deposit,
    })) {
      if (!value.trim()) {
        throw new TypeError(`${name} is required`);
      }
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(input.intent.methodName)) {
      throw new TypeError('Contract method name is invalid');
    }
    if (
      !/^(0|[1-9][0-9]*)$/.test(input.intent.gas) ||
      !/^(0|[1-9][0-9]*)$/.test(input.intent.deposit)
    ) {
      throw new TypeError('Gas and deposit must be unsigned integer strings');
    }
    if (
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        input.intent.argsBase64,
      )
    ) {
      throw new TypeError('Contract arguments must be base64 encoded');
    }
  }
}
