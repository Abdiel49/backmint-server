import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AsyncQueuesModule } from '../async-queues/async-queues.module.js';
import { OutboxEventEntity } from './outbox-event.entity.js';
import { OutboxRelayService } from './outbox-relay.service.js';
import { OutboxService } from './outbox.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([OutboxEventEntity]),
    AsyncQueuesModule,
  ],
  providers: [OutboxService, OutboxRelayService],
  exports: [OutboxService],
})
export class OutboxModule {}
