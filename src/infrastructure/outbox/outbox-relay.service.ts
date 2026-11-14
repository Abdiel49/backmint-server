import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxService } from './outbox.service.js';

@Injectable()
export class OutboxRelayService {
  constructor(private readonly outboxService: OutboxService) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async relay(): Promise<void> {
    await this.outboxService.publishPending();
  }
}
