import { ConflictException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  createAuditEvent,
  createIdempotencyRecord,
  createExternalIntegrationRecord,
  type JsonValue,
} from '../domain/events/event-primitives.js';
import { AuditEventEntity } from './audit-event.entity.js';
import { IdempotencyRecordEntity } from './idempotency-record.entity.js';
import { ExternalIntegrationRecordEntity } from './external-integration-record.entity.js';

export type ReserveIdempotencyResult =
  | { state: 'Reserved'; id: string }
  | { state: 'Replay'; response: JsonValue }
  | { state: 'InProgress' };

export type ExternalIntegrationState =
  | 'Pending'
  | 'Submitted'
  | 'Confirmed'
  | 'Failed'
  | 'Unknown';

@Injectable()
export class AuditPersistenceService {
  async createExternalIntegration(
    manager: EntityManager,
    input: Parameters<typeof createExternalIntegrationRecord>[0],
  ): Promise<ExternalIntegrationRecordEntity> {
    this.assertTransaction(manager);
    const record = createExternalIntegrationRecord(input);
    const repository = manager.getRepository(ExternalIntegrationRecordEntity);
    return repository.save(
      repository.create({
        ...record,
        causationId: record.causationId ?? null,
        externalReference: null,
        errorCode: null,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
      }),
    );
  }

  async transitionExternalIntegration(input: {
    manager: EntityManager;
    id: string;
    expectedState: ExternalIntegrationState;
    nextState: ExternalIntegrationState;
    externalReference?: string;
    errorCode?: string;
  }): Promise<void> {
    this.assertTransaction(input.manager);
    this.assertIntegrationTransition(input.expectedState, input.nextState);

    const rows = (await input.manager.query(
      `UPDATE external_integration_records
        SET state = $3, external_reference = COALESCE($4, external_reference),
            error_code = $5, updated_at = NOW()
      WHERE id = $1 AND state = $2
      RETURNING id`,
      [
        input.id,
        input.expectedState,
        input.nextState,
        input.externalReference ?? null,
        input.errorCode ?? null,
      ],
    )) as Array<{ id: string }>;

    if (rows.length !== 1) {
      throw new ConflictException('External integration state changed concurrently');
    }
  }

  async appendAuditEvent(
    manager: EntityManager,
    input: Parameters<typeof createAuditEvent>[0],
  ): Promise<AuditEventEntity> {
    this.assertTransaction(manager);
    const event = createAuditEvent(input);
    const repository = manager.getRepository(AuditEventEntity);
    return repository.save(
      repository.create({
        id: event.id,
        action: event.action,
        outcome: event.outcome,
        targetType: event.targetType,
        targetId: event.targetId,
        actorUserId: event.actor.userId,
        actingOrganizationId: event.actor.organizationId ?? null,
        membershipRole: event.actor.membershipRole ?? null,
        correlationId: event.correlationId,
        occurredAt: new Date(event.occurredAt),
        beforeHash: event.beforeHash ?? null,
        afterHash: event.afterHash ?? null,
        reasonCode: event.reasonCode ?? null,
      }),
    );
  }

  async reserveIdempotency(input: {
    manager: EntityManager;
    scope: string;
    key: string;
    request: JsonValue;
    ttlSeconds?: number;
  }): Promise<ReserveIdempotencyResult> {
    this.assertTransaction(input.manager);
    this.validateIdempotencyInput(input.scope, input.key, input.ttlSeconds);
    const ttlSeconds = input.ttlSeconds ?? 86_400;
    const record = createIdempotencyRecord({
      scope: input.scope,
      key: input.key,
      request: input.request,
      ttlSeconds,
    });
    const requestHash = record.requestHash;
    const rows = (await input.manager.query(
      `INSERT INTO idempotency_records
        (scope, key, request_hash, state, response, expires_at, completed_at, created_at)
      VALUES ($1, $2, $3, 'InProgress', NULL, NOW() + ($4::integer * INTERVAL '1 second'), NULL, NOW())
      ON CONFLICT (scope, key) DO UPDATE
        SET request_hash = EXCLUDED.request_hash,
            state = 'InProgress',
            response = NULL,
            expires_at = EXCLUDED.expires_at,
            completed_at = NULL,
            created_at = NOW()
        WHERE idempotency_records.expires_at <= NOW()
      RETURNING id, request_hash, state, response`,
      [input.scope, input.key, requestHash, ttlSeconds],
    )) as Array<{
      id: string;
      request_hash: string;
      state: 'InProgress' | 'Completed';
      response: JsonValue | null;
    }>;

    if (rows.length) {
      return { state: 'Reserved', id: rows[0].id };
}
    const existing = await input.manager
      .getRepository(IdempotencyRecordEntity)
      .findOneBy({ scope: input.scope, key: input.key });

    if (!existing) {
      throw new ConflictException('Idempotency request could not be reserved');
    }
    if (existing.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency key was reused with a different request',
      );
    }
    if (existing.state === 'Completed') {
      return { state: 'Replay', response: existing.response as JsonValue };
    }

    return { state: 'InProgress' };
  }

  async completeIdempotency(input: {
    manager: EntityManager;
    id: string;
    requestHash: string;
    response: JsonValue;
  }): Promise<void> {
    this.assertTransaction(input.manager);
    const rows = (await input.manager.query(
      `UPDATE idempotency_records
        SET state = 'Completed', response = $3::jsonb, completed_at = NOW()
      WHERE id = $1 AND request_hash = $2 AND state = 'InProgress' AND expires_at > NOW()
      RETURNING id`,
      [input.id, input.requestHash, JSON.stringify(input.response)],
    )) as Array<{ id: string }>;

    if (rows.length !== 1) {
      throw new ConflictException('Idempotency reservation is no longer active');
    }
  }

  private validateIdempotencyInput(
    scope: string,
    key: string,
    ttlSeconds?: number,
  ): void {
    if (!scope.trim() || scope.length > 160) {
      throw new TypeError('Idempotency scope must contain 1 to 160 characters');
    }
    if (!key.trim() || key.length > 255) {
      throw new TypeError('Idempotency key must contain 1 to 255 characters');
    }
    if (
      ttlSeconds !== undefined &&
      (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1)
    ) {
      throw new RangeError('Idempotency TTL must be a positive integer');
    }
  }

  private assertTransaction(manager: EntityManager): void {
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error('Audit and idempotency records require an active transaction');
    }
  }

  private assertIntegrationTransition(
    current: ExternalIntegrationState,
    next: ExternalIntegrationState,
  ): void {
    const allowed: Record<ExternalIntegrationState, ExternalIntegrationState[]> = {
      Pending: ['Submitted', 'Failed', 'Unknown'],
      Submitted: ['Confirmed', 'Failed', 'Unknown'],
      Confirmed: [],
      Failed: [],
      Unknown: ['Submitted', 'Confirmed', 'Failed'],
    };

    if (!allowed[current].includes(next)) {
      throw new ConflictException(`External integration cannot move from ${current} to ${next}`);
    }
  }

}
