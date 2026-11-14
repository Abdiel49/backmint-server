import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type EntityManager } from 'typeorm';
import { AsyncQueueName } from '../async-queues/async-queues.constants.js';
import { AsyncQueuesService } from '../async-queues/async-queues.service.js';
import { OutboxEventEntity } from './outbox-event.entity.js';

export interface NewOutboxEvent {
  eventName: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  correlationId: string;
  causationId?: string;
}

interface PendingOutboxEvent {
  id: string;
  event_name: string;
  payload: Record<string, unknown>;
  aggregate_id: string;
  correlation_id: string;
  causation_id: string | null;
}

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    @InjectRepository(OutboxEventEntity)
    private readonly outboxRepository: Repository<OutboxEventEntity>,
    private readonly asyncQueues: AsyncQueuesService,
  ) {}

  async append(
    manager: EntityManager,
    event: NewOutboxEvent,
  ): Promise<OutboxEventEntity> {
    const repository = manager.getRepository(OutboxEventEntity);

    return repository.save(
      repository.create({
        ...event,
        causationId: event.causationId ?? null,
        publishedAt: null,
        attempts: 0,
        lastError: null,
      }),
    );
  }

  async publishPending(batchSize = 100): Promise<number> {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
      throw new RangeError('Outbox batch size must be between 1 and 1000');
    }

    const events = await this.outboxRepository.manager.transaction(
      async (manager) =>
        (await manager.query(
          `WITH pending AS (
            SELECT id
            FROM domain_outbox_events
            WHERE published_at IS NULL
              AND (locked_until IS NULL OR locked_until < now())
            ORDER BY created_at
            FOR UPDATE SKIP LOCKED
            LIMIT $1
          )
          UPDATE domain_outbox_events AS event
          SET attempts = event.attempts + 1,
              locked_until = now() + interval '60 seconds'
          FROM pending
          WHERE event.id = pending.id
          RETURNING event.id, event.event_name, event.payload, event.aggregate_id,
                    event.correlation_id, event.causation_id`,
          [batchSize],
        )) as PendingOutboxEvent[],
    );

    let publishedCount = 0;

    for (const event of events) {
      try {
        await this.asyncQueues.enqueue(
          AsyncQueueName.RetryableDelivery,
          event.event_name,
          {
            eventId: event.id,
            aggregateId: event.aggregate_id,
            payload: event.payload,
            correlationId: event.correlation_id,
            causationId: event.causation_id,
          },
          { jobId: event.id },
        );
        await this.outboxRepository.update(
          { id: event.id },
          { publishedAt: new Date(), lastError: null },
        );
        publishedCount += 1;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown queue error';

        await this.outboxRepository.update(
          { id: event.id },
          { lastError: message.slice(0, 2_000), lockedUntil: null },
        );
        this.logger.error(
          JSON.stringify({
            eventId: event.id,
            errorName: error instanceof Error ? error.name : 'UnknownError',
          }),
        );
      }
    }

    return publishedCount;
  }
}
