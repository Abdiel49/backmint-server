import { describe, expect, it, vi } from 'vitest';
import { AsyncQueueName } from './async-queues.constants.js';
import { AsyncQueuesService } from './async-queues.service.js';

function createService(attempts = 5) {
  const notificationsQueue = {
    name: AsyncQueueName.Notifications,
    getJob: vi.fn(),
    add: vi.fn(),
  };
  const malwareScansQueue = {
    name: AsyncQueueName.MalwareScans,
    getJob: vi.fn(),
    add: vi.fn(),
  };
  const milestoneEvidenceScansQueue = {
    name: AsyncQueueName.MilestoneEvidenceScans,
    getJob: vi.fn(),
    add: vi.fn(),
  };
  const chainReconciliationQueue = {
    name: AsyncQueueName.ChainReconciliation,
    getJob: vi.fn(),
    add: vi.fn(),
  };
  const aggregationQueue = {
    name: AsyncQueueName.Aggregation,
    getJob: vi.fn(),
    add: vi.fn(),
  };
  const retryableDeliveryQueue = {
    name: AsyncQueueName.RetryableDelivery,
    getJob: vi.fn(),
    add: vi.fn(),
  };
  const deadLetterQueue = {
    add: vi.fn(),
  };

  const service = new AsyncQueuesService(
    {
      attempts,
      backoffDelay: 1_000,
      completedRetention: { age: 86_400, count: 1_000 },
      failedRetention: { age: 604_800, count: 1_000 },
    },
    { host: 'localhost', port: 6379, password: undefined },
    notificationsQueue as never,
    malwareScansQueue as never,
    milestoneEvidenceScansQueue as never,
    chainReconciliationQueue as never,
    aggregationQueue as never,
    retryableDeliveryQueue as never,
    deadLetterQueue as never,
  );

  return { service, notificationsQueue, deadLetterQueue };
}

describe('AsyncQueuesService', () => {
  it('quarantines a terminally failed job with a deterministic identifier', async () => {
    const { service, notificationsQueue, deadLetterQueue } = createService();
    notificationsQueue.getJob.mockResolvedValue({
      id: '42',
      name: 'send-notification',
      data: { recipientId: 'user-123' },
      attemptsMade: 5,
    });

    await service.moveFailedJobToDeadLetter(
      notificationsQueue as never,
      '42',
      'provider timeout',
    );

    expect(deadLetterQueue.add).toHaveBeenCalledWith(
      'quarantine',
      expect.objectContaining({
        sourceQueue: AsyncQueueName.Notifications,
        sourceJobId: '42',
        sourceJobName: 'send-notification',
        payload: { recipientId: 'user-123' },
        failedReason: 'provider timeout',
        attemptsMade: 5,
      }),
      { jobId: 'notifications-42' },
    );
  });

  it('does not quarantine a job before it exhausts its retry budget', async () => {
    const { service, notificationsQueue, deadLetterQueue } = createService();
    notificationsQueue.getJob.mockResolvedValue({
      id: '42',
      name: 'send-notification',
      data: { recipientId: 'user-123' },
      attemptsMade: 4,
    });

    await service.moveFailedJobToDeadLetter(
      notificationsQueue as never,
      '42',
      'provider timeout',
    );

    expect(deadLetterQueue.add).not.toHaveBeenCalled();
  });
});
