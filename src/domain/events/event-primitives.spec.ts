import {
  assertIdempotentReplay,
  createAuditEvent,
  createDomainEvent,
  createExternalIntegrationRecord,
  createIdempotencyRecord,
} from './event-primitives.js';

describe('domain event and integration primitives', () => {
  const context = {
    actor: { userId: 'user-1', organizationId: 'org-1', membershipRole: 'Owner' },
    correlationId: 'request-1',
    causationId: 'command-1',
    occurredAt: new Date('2026-11-14T00:00:00.000Z'),
  };

  it('creates immutable domain events with actor, causal links and payload hash', () => {
    const payload = { status: 'Submitted', answers: [{ questionId: 'q1' }] };
    const event = createDomainEvent(
      {
        eventName: 'ApplicationSubmitted',
        aggregateType: 'Application',
        aggregateId: 'application-1',
        aggregateVersion: 2,
        payload,
      },
      context,
    );

    payload.answers.push({ questionId: 'q2' });
    expect(event.payload.answers).toHaveLength(1);
    expect(event.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(event).toMatchObject({
      actor: context.actor,
      correlationId: context.correlationId,
      causationId: context.causationId,
    });
    expect(Object.isFrozen(event.payload.answers)).toBe(true);
  });

  it('requires valid domain event context and aggregate version', () => {
    expect(() =>
      createDomainEvent(
        {
          eventName: 'Changed',
          aggregateType: 'Project',
          aggregateId: 'project-1',
          aggregateVersion: 0,
          payload: {},
        },
        { ...context, actor: { userId: '' } },
      ),
    ).toThrow();
  });

  it('creates audit facts for allow, deny, or failure outcomes', () => {
    const event = createAuditEvent({
      action: 'agreement.accept',
      outcome: 'Denied',
      targetType: 'Agreement',
      targetId: 'agreement-1',
      actor: context.actor,
      correlationId: context.correlationId,
      reasonCode: 'REPRESENTATIVE_AUTHORITY_REQUIRED',
    });

    expect(event).toMatchObject({
      outcome: 'Denied',
      reasonCode: 'REPRESENTATIVE_AUTHORITY_REQUIRED',
      correlationId: 'request-1',
    });
  });

  it('hashes idempotency requests canonically and rejects conflicting reuse', () => {
    const record = createIdempotencyRecord({
      scope: 'POST:/api/agreements',
      key: 'client-key-123',
      request: { amount: '1000', asset: 'NEAR' },
      now: new Date('2026-11-14T00:00:00.000Z'),
    });

    expect(() =>
      assertIdempotentReplay(record, { asset: 'NEAR', amount: '1000' }),
    ).not.toThrow();
    expect(() =>
      assertIdempotentReplay(record, { asset: 'NEAR', amount: '2000' }),
    ).toThrow('different request');
  });

  it('creates pending external operation records with stable request hashes', () => {
    const record = createExternalIntegrationRecord({
      provider: 'near',
      operation: 'register-agreement',
      idempotencyKey: 'agreement-1-register-v1',
      correlationId: context.correlationId,
      causationId: context.causationId,
      request: { agreementId: 'agreement-1' },
      now: context.occurredAt,
    });

    expect(record).toMatchObject({
      provider: 'near',
      operation: 'register-agreement',
      state: 'Pending',
      requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      createdAt: '2026-11-14T00:00:00.000Z',
      updatedAt: '2026-11-14T00:00:00.000Z',
    });
  });
});
