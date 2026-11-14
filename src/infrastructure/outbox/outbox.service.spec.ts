import { describe, expect, it, vi } from 'vitest';
import type { EntityManager, Repository } from 'typeorm';
import { AsyncQueuesService } from '../async-queues/async-queues.service.js';
import { OutboxEventEntity } from './outbox-event.entity.js';
import { OutboxService } from './outbox.service.js';

function createOutboxService(events: Record<string, unknown>[]) {
  const update = vi.fn().mockResolvedValue({ affected: 1 });
  const manager = {
    transaction: vi.fn(async (callback) =>
      callback({
        query: vi.fn().mockResolvedValue(events),
      }),
    ),
  };
  const repository = {
    manager,
    update,
  };
  const queues = { enqueue: vi.fn().mockResolvedValue('job-1') };
  const service = new OutboxService(
    repository as unknown as Repository<OutboxEventEntity>,
    queues as unknown as AsyncQueuesService,
  );

  return { service, update, queues, manager };
}

describe('OutboxService', () => {
  it('dispatches pending events with deterministic queue job IDs and marks them published', async () => {
    const { service, update, queues } = createOutboxService([
      {
        id: 'event-123',
        event_name: 'ApplicationSubmitted',
        aggregate_id: 'application-456',
        payload: { status: 'Submitted' },
        correlation_id: 'request-789',
        causation_id: null,
      },
    ]);

    await expect(service.publishPending()).resolves.toBe(1);
    expect(queues.enqueue).toHaveBeenCalledWith(
      'retryable-delivery',
      'ApplicationSubmitted',
      expect.objectContaining({
        eventId: 'event-123',
        aggregateId: 'application-456',
      }),
      { jobId: 'event-123' },
    );
    expect(update).toHaveBeenCalledWith(
      { id: 'event-123' },
      expect.objectContaining({ publishedAt: expect.any(Date) }),
    );
  });

  it('retains failed events for retry and clears the lease', async () => {
    const { service, update, queues } = createOutboxService([
      {
        id: 'event-123',
        event_name: 'ApplicationSubmitted',
        aggregate_id: 'application-456',
        payload: {},
        correlation_id: 'request-789',
        causation_id: null,
      },
    ]);
    queues.enqueue.mockRejectedValue(new Error('Redis unavailable'));

    await expect(service.publishPending()).resolves.toBe(0);
    expect(update).toHaveBeenCalledWith(
      { id: 'event-123' },
      { lastError: 'Redis unavailable', lockedUntil: null },
    );
  });

  it('routes notification outbox events to the notifications queue', async () => {
    const { service, queues } = createOutboxService([
      {
        id: 'event-123',
        event_name: 'notification.created',
        aggregate_id: 'notification-456',
        payload: { notificationId: 'notification-456' },
        correlation_id: 'request-789',
        causation_id: null,
      },
    ]);

    await expect(service.publishPending()).resolves.toBe(1);
    expect(queues.enqueue).toHaveBeenCalledWith(
      'notifications',
      'deliver-notification',
      expect.objectContaining({ notificationId: 'notification-456' }),
      { jobId: 'event-123' },
    );
  });

  it('appends the event through the caller transaction manager', async () => {
    const { service } = createOutboxService([]);
    const savedEvent = { id: 'event-123' };
    const repository = {
      create: vi.fn((event) => event),
      save: vi.fn().mockResolvedValue(savedEvent),
    };
    const manager = {
      getRepository: vi.fn().mockReturnValue(repository),
    };

    await expect(
      service.append(manager as unknown as EntityManager, {
        eventName: 'ApplicationSubmitted',
        aggregateId: 'application-456',
        payload: { status: 'Submitted' },
        correlationId: 'request-789',
      }),
    ).resolves.toBe(savedEvent);
    expect(manager.getRepository).toHaveBeenCalledWith(OutboxEventEntity);
  });

  it('rejects unbounded batch sizes', async () => {
    const { service, manager } = createOutboxService([]);

    await expect(service.publishPending(1_001)).rejects.toThrow(RangeError);
    expect(manager.transaction).not.toHaveBeenCalled();
  });
});
