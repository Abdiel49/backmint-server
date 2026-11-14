import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { ConfigType } from '@nestjs/config';
import { Queue, QueueEvents, type JobsOptions } from 'bullmq';
import { queuesConfig, redisConfig } from '../../config/configuration.js';
import {
  ASYNC_WORK_QUEUE_NAMES,
  AsyncQueueName,
  type AsyncQueueName as AsyncQueueNameType,
} from './async-queues.constants.js';

type QueuePayload = Record<string, unknown>;

export interface DeadLetterJob {
  sourceQueue: AsyncQueueNameType;
  sourceJobId: string;
  sourceJobName: string;
  payload: QueuePayload;
  failedReason: string;
  attemptsMade: number;
  failedAt: string;
}

type EnqueueOptions = Omit<
  JobsOptions,
  'attempts' | 'backoff' | 'removeOnComplete' | 'removeOnFail'
>;

@Injectable()
export class AsyncQueuesService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AsyncQueuesService.name);
  private readonly queueEvents: QueueEvents[] = [];
  private readonly sourceQueues: Queue<QueuePayload>[];

  constructor(
    @Inject(queuesConfig.KEY)
    private readonly queuesConfiguration: ConfigType<typeof queuesConfig>,
    @Inject(redisConfig.KEY)
    private readonly redisConfiguration: ConfigType<typeof redisConfig>,
    @InjectQueue(AsyncQueueName.Notifications)
    private readonly notificationsQueue: Queue<QueuePayload>,
    @InjectQueue(AsyncQueueName.MalwareScans)
    private readonly malwareScansQueue: Queue<QueuePayload>,
    @InjectQueue(AsyncQueueName.MilestoneEvidenceScans)
    private readonly milestoneEvidenceScansQueue: Queue<QueuePayload>,
    @InjectQueue(AsyncQueueName.ApplicationAttachmentScans)
    private readonly applicationAttachmentScansQueue: Queue<QueuePayload>,
    @InjectQueue(AsyncQueueName.ChainReconciliation)
    private readonly chainReconciliationQueue: Queue<QueuePayload>,
    @InjectQueue(AsyncQueueName.Aggregation)
    private readonly aggregationQueue: Queue<QueuePayload>,
    @InjectQueue(AsyncQueueName.RetryableDelivery)
    private readonly retryableDeliveryQueue: Queue<QueuePayload>,
    @InjectQueue(AsyncQueueName.DeadLetter)
    private readonly deadLetterQueue: Queue<DeadLetterJob>,
  ) {
    this.sourceQueues = [
      this.notificationsQueue,
      this.malwareScansQueue,
      this.milestoneEvidenceScansQueue,
      this.applicationAttachmentScansQueue,
      this.chainReconciliationQueue,
      this.aggregationQueue,
      this.retryableDeliveryQueue,
    ];
  }

  async onModuleInit(): Promise<void> {
    for (const queue of this.sourceQueues) {
      const queueEvents = new QueueEvents(queue.name, {
        connection: {
          host: this.redisConfiguration.host,
          port: this.redisConfiguration.port,
          password: this.redisConfiguration.password,
        },
      });

      queueEvents.on('failed', ({ jobId, failedReason }) => {
        void this.moveFailedJobToDeadLetter(queue, jobId, failedReason);
      });

      this.queueEvents.push(queueEvents);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(
      this.queueEvents.map((queueEvents) => queueEvents.close()),
    );
  }

  async enqueue(
    queueName: Exclude<AsyncQueueNameType, typeof AsyncQueueName.DeadLetter>,
    jobName: string,
    payload: QueuePayload,
    options?: EnqueueOptions,
  ): Promise<string> {
    const queue = this.getQueue(queueName);
    const job = await queue.add(jobName, payload, options);

    if (!job.id) {
      throw new Error(
        `Queue job for ${queueName} did not receive an identifier`,
      );
    }

    return job.id;
  }

  async moveFailedJobToDeadLetter(
    sourceQueue: Queue<QueuePayload>,
    jobId: string,
    failedReason: string,
  ): Promise<void> {
    const job = await sourceQueue.getJob(jobId);

    if (
      !job ||
      job.attemptsMade < this.queuesConfiguration.attempts ||
      !job.id
    ) {
      return;
    }

    const sourceQueueName = sourceQueue.name as AsyncQueueNameType;
    const deadLetterJob: DeadLetterJob = {
      sourceQueue: sourceQueueName,
      sourceJobId: job.id,
      sourceJobName: job.name,
      payload: job.data,
      failedReason,
      attemptsMade: job.attemptsMade,
      failedAt: new Date().toISOString(),
    };

    try {
      await this.deadLetterQueue.add('quarantine', deadLetterJob, {
        jobId: `${sourceQueueName}-${job.id}`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to quarantine job ${job.id} from ${sourceQueueName}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private getQueue(
    queueName: Exclude<AsyncQueueNameType, typeof AsyncQueueName.DeadLetter>,
  ): Queue<QueuePayload> {
    const queue = this.sourceQueues.find(
      (candidate) => candidate.name === queueName,
    );

    if (!queue || !ASYNC_WORK_QUEUE_NAMES.includes(queueName)) {
      throw new Error(`Unsupported work queue: ${queueName}`);
    }

    return queue;
  }
}
