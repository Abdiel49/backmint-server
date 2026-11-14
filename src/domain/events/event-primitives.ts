import { createHash, randomUUID } from 'node:crypto';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ActingCapacity = {
  userId: string;
  organizationId?: string;
  membershipRole?: string;
};

export type EventContext = {
  actor: ActingCapacity;
  correlationId: string;
  causationId?: string;
  occurredAt?: Date;
};

export type DomainEvent<TPayload extends JsonValue = JsonValue> = {
  id: string;
  eventName: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  occurredAt: string;
  actor: Readonly<ActingCapacity>;
  correlationId: string;
  causationId?: string;
  payload: Readonly<TPayload>;
  payloadHash: string;
};

export type AuditEvent = {
  id: string;
  action: string;
  outcome: 'Allowed' | 'Denied' | 'Failed';
  targetType: string;
  targetId: string;
  actor: Readonly<ActingCapacity>;
  correlationId: string;
  occurredAt: string;
  beforeHash?: string;
  afterHash?: string;
  reasonCode?: string;
};

export type IdempotencyRecord<TResponse extends JsonValue = JsonValue> = {
  scope: string;
  key: string;
  requestHash: string;
  state: 'InProgress' | 'Completed';
  response?: Readonly<TResponse>;
  createdAt: string;
  expiresAt: string;
};

export type ExternalIntegrationRecord = {
  id: string;
  provider: string;
  operation: string;
  idempotencyKey: string;
  correlationId: string;
  causationId?: string;
  requestHash: string;
  state: 'Pending' | 'Submitted' | 'Confirmed' | 'Failed' | 'Unknown';
  externalReference?: string;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
};

function canonicalJson(value: JsonValue, ancestors = new Set<object>()): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new TypeError('JSON numbers must be finite');
    }

    return JSON.stringify(value);
  }

  if (ancestors.has(value)) {
    throw new TypeError('JSON values cannot contain circular references');
  }

  ancestors.add(value);
  const serialized = Array.isArray(value)
    ? `[${value.map((item) => canonicalJson(item, ancestors)).join(',')}]`
    : `{${Object.keys(value)
        .sort()
        .map((key) => {
          const property = value[key];
          if (property === undefined) {
            throw new TypeError('JSON values cannot contain undefined properties');
          }
          return `${JSON.stringify(key)}:${canonicalJson(property, ancestors)}`;
        })
        .join(',')}}`;
  ancestors.delete(value);

  return serialized;
}

function digest(value: JsonValue): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function assertText(name: string, value: string): void {
  if (!value.trim()) {
    throw new TypeError(`${name} is required`);
  }
}

function immutableCopy<T extends JsonValue>(value: T): Readonly<T> {
  const copy = JSON.parse(canonicalJson(value)) as T;

  const freeze = (item: unknown): void => {
    if (!item || typeof item !== 'object' || Object.isFrozen(item)) {
      return;
    }
    Object.freeze(item);
    Object.values(item).forEach(freeze);
  };

  freeze(copy);
  return copy;
}

function isoDate(value?: Date): string {
  const date = value ?? new Date();
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('Timestamp must be a valid date');
  }
  return date.toISOString();
}

function validateContext(context: EventContext): void {
  assertText('actor.userId', context.actor.userId);
  assertText('correlationId', context.correlationId);
  if (context.actor.organizationId !== undefined) {
    assertText('actor.organizationId', context.actor.organizationId);
  }
  if (context.causationId !== undefined) {
    assertText('causationId', context.causationId);
  }
}

export function createDomainEvent<TPayload extends JsonValue>(
  event: {
    eventName: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    payload: TPayload;
  },
  context: EventContext,
): DomainEvent<TPayload> {
  validateContext(context);
  assertText('eventName', event.eventName);
  assertText('aggregateType', event.aggregateType);
  assertText('aggregateId', event.aggregateId);

  if (!Number.isSafeInteger(event.aggregateVersion) || event.aggregateVersion < 1) {
    throw new RangeError('aggregateVersion must be a positive safe integer');
  }

  const payload = immutableCopy(event.payload);

  return Object.freeze({
    id: randomUUID(),
    eventName: event.eventName,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    aggregateVersion: event.aggregateVersion,
    occurredAt: isoDate(context.occurredAt),
    actor: Object.freeze({ ...context.actor }),
    correlationId: context.correlationId,
    ...(context.causationId ? { causationId: context.causationId } : {}),
    payload,
    payloadHash: digest(event.payload),
  });
}

export function createAuditEvent(
  event: Omit<AuditEvent, 'id' | 'occurredAt' | 'actor'> & {
    occurredAt?: Date;
    actor: ActingCapacity;
  },
): AuditEvent {
  assertText('action', event.action);
  assertText('targetType', event.targetType);
  assertText('targetId', event.targetId);
  assertText('actor.userId', event.actor.userId);
  assertText('correlationId', event.correlationId);

  return Object.freeze({
    ...event,
    id: randomUUID(),
    occurredAt: isoDate(event.occurredAt),
    actor: Object.freeze({ ...event.actor }),
  });
}

export function createIdempotencyRecord<TResponse extends JsonValue>(input: {
  scope: string;
  key: string;
  request: JsonValue;
  now?: Date;
  ttlSeconds?: number;
}): IdempotencyRecord<TResponse> {
  assertText('scope', input.scope);
  assertText('key', input.key);
  const ttlSeconds = input.ttlSeconds ?? 86_400;
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) {
    throw new RangeError('ttlSeconds must be a positive safe integer');
  }

  const createdAt = input.now ?? new Date();
  const expiresAt = new Date(createdAt.getTime() + ttlSeconds * 1_000);
  if (Number.isNaN(createdAt.getTime()) || Number.isNaN(expiresAt.getTime())) {
    throw new TypeError('Idempotency timestamps must be valid dates');
  }

  return Object.freeze({
    scope: input.scope,
    key: input.key,
    requestHash: digest(input.request),
    state: 'InProgress',
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });
}

export function assertIdempotentReplay(
  record: Pick<IdempotencyRecord, 'requestHash'>,
  request: JsonValue,
): void {
  const currentHash = digest(request);
  if (record.requestHash !== currentHash) {
    throw new Error('Idempotency key was reused with a different request');
  }
}

export function createExternalIntegrationRecord(input: {
  provider: string;
  operation: string;
  idempotencyKey: string;
  correlationId: string;
  causationId?: string;
  request: JsonValue;
  now?: Date;
}): ExternalIntegrationRecord {
  assertText('provider', input.provider);
  assertText('operation', input.operation);
  assertText('idempotencyKey', input.idempotencyKey);
  assertText('correlationId', input.correlationId);
  const timestamp = isoDate(input.now);

  return Object.freeze({
    id: randomUUID(),
    provider: input.provider,
    operation: input.operation,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    ...(input.causationId ? { causationId: input.causationId } : {}),
    requestHash: digest(input.request),
    state: 'Pending',
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
