import { describe, expect, it } from 'vitest';
import {
  createDeadLetterDefaultJobOptions,
  createQueueDefaultJobOptions,
} from './async-queues.options.js';

const queuesConfiguration = {
  attempts: 5,
  backoffDelay: 1_000,
  completedRetention: {
    age: 86_400,
    count: 1_000,
  },
  failedRetention: {
    age: 604_800,
    count: 1_000,
  },
};

describe('async queue job options', () => {
  it('uses bounded exponential retries and retention for work queues', () => {
    expect(createQueueDefaultJobOptions(queuesConfiguration)).toEqual({
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 1_000,
      },
      removeOnComplete: {
        age: 86_400,
        count: 1_000,
      },
      removeOnFail: {
        age: 604_800,
        count: 1_000,
      },
    });
  });

  it('does not retry quarantined jobs', () => {
    expect(createDeadLetterDefaultJobOptions(queuesConfiguration)).toEqual({
      attempts: 1,
      removeOnComplete: {
        age: 86_400,
        count: 1_000,
      },
      removeOnFail: {
        age: 604_800,
        count: 1_000,
      },
    });
  });
});
