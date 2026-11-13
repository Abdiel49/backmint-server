import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { queuesConfig } from '../../config/configuration.js';
import { AsyncQueueName } from './async-queues.constants.js';
import {
  createDeadLetterDefaultJobOptions,
  createQueueDefaultJobOptions,
} from './async-queues.options.js';
import { AsyncQueuesService } from './async-queues.service.js';

@Module({
  imports: [
    BullModule.registerQueueAsync(
      ...Object.values(AsyncQueueName).map((name) => ({
        name,
        inject: [queuesConfig.KEY],
        useFactory: (configuration: ConfigType<typeof queuesConfig>) => ({
          defaultJobOptions:
            name === AsyncQueueName.DeadLetter
              ? createDeadLetterDefaultJobOptions(configuration)
              : createQueueDefaultJobOptions(configuration),
        }),
      })),
    ),
  ],
  providers: [AsyncQueuesService],
  exports: [AsyncQueuesService],
})
export class AsyncQueuesModule {}
