import type { ConfigType } from '@nestjs/config';
import type { DefaultJobOptions } from 'bullmq';
import type { queuesConfig } from '../../config/configuration.js';

type QueuesConfiguration = ConfigType<typeof queuesConfig>;

export function createQueueDefaultJobOptions(
  configuration: QueuesConfiguration,
): DefaultJobOptions {
  return {
    attempts: configuration.attempts,
    backoff: {
      type: 'exponential',
      delay: configuration.backoffDelay,
    },
    removeOnComplete: configuration.completedRetention,
    removeOnFail: configuration.failedRetention,
  };
}

export function createDeadLetterDefaultJobOptions(
  configuration: QueuesConfiguration,
): DefaultJobOptions {
  return {
    attempts: 1,
    removeOnComplete: configuration.completedRetention,
    removeOnFail: configuration.failedRetention,
  };
}
