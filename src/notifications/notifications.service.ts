import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AsyncQueueName } from '../infrastructure/async-queues/async-queues.constants.js';
import { AsyncQueuesService } from '../infrastructure/async-queues/async-queues.service.js';
import { OutboxService } from '../infrastructure/outbox/outbox.service.js';
import { NotificationEntity } from './notification.entity.js';
import { NotificationPreferenceEntity } from './notification-preference.entity.js';

export interface CreateNotificationInput {
  userId: string;
  idempotencyKey: string;
  category: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  correlationId: string;
}

export interface UpdateNotificationPreferenceInput {
  userId: string;
  category: string;
  inboxEnabled: boolean;
  emailEnabled: boolean;
}

export interface NotificationInboxPage {
  items: NotificationEntity[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(NotificationEntity)
    private readonly notifications: Repository<NotificationEntity>,
    @InjectRepository(NotificationPreferenceEntity)
    private readonly preferences: Repository<NotificationPreferenceEntity>,
    private readonly outbox: OutboxService,
    private readonly queues: AsyncQueuesService,
  ) {}

  async updatePreference(
    input: UpdateNotificationPreferenceInput,
  ): Promise<NotificationPreferenceEntity> {
    this.validateCategory(input.category);
    await this.preferences.upsert(input, ['userId', 'category']);
    return this.preferences.findOneByOrFail({
      userId: input.userId,
      category: input.category,
    });
  }

  async listPreferences(
    userId: string,
  ): Promise<NotificationPreferenceEntity[]> {
    return this.preferences.find({
      where: { userId },
      order: { category: 'ASC' },
    });
  }

  async listInbox(
    userId: string,
    page = 1,
    pageSize = 20,
  ): Promise<NotificationInboxPage> {
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    ) {
      throw new RangeError('Notification inbox pagination is invalid');
    }

    const [items, total] = await this.notifications.findAndCount({
      where: { userId, inboxEnabled: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items, total, page, pageSize };
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    const result = await this.notifications
      .createQueryBuilder()
      .update(NotificationEntity)
      .set({ readAt: new Date() })
      .where(
        'id = :notificationId AND "userId" = :userId AND "inboxEnabled" = true AND "readAt" IS NULL',
        { notificationId, userId },
      )
      .execute();
    if (!result.affected) {
      throw new NotFoundException('Unread inbox notification was not found');
    }
  }

  async create(input: CreateNotificationInput): Promise<NotificationEntity> {
    this.validateInput(input);

    return this.dataSource.transaction(async (manager) => {
      const preference = await manager
        .getRepository(NotificationPreferenceEntity)
        .findOneBy({ userId: input.userId, category: input.category });
      const inboxEnabled = preference?.inboxEnabled ?? true;
      const emailEnabled = preference?.emailEnabled ?? false;
      const notificationRepository = manager.getRepository(NotificationEntity);
      const inserted = (await manager.query(
        `INSERT INTO notifications
          ("userId", "idempotencyKey", category, title, body, data,
           "inboxEnabled", "emailEnabled", "emailStatus", "processingStatus",
           attempts, "lastFailure", "readAt", "processedAt", created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, 'Pending', 0, NULL, NULL, NULL, NOW(), NOW())
         ON CONFLICT ("userId", "idempotencyKey") DO NOTHING
         RETURNING id`,
        [
          input.userId,
          input.idempotencyKey,
          input.category,
          input.title,
          input.body,
          JSON.stringify(input.data ?? {}),
          inboxEnabled,
          emailEnabled,
          emailEnabled ? 'NotConfigured' : 'NotRequested',
        ],
      )) as Array<{ id: string }>;

      if (!inserted.length) {
        const existing = await notificationRepository.findOneBy({
          userId: input.userId,
          idempotencyKey: input.idempotencyKey,
        });
        if (!existing) {
          throw new Error('Notification idempotency record was not found');
        }
        if (
          existing.category !== input.category ||
          existing.title !== input.title ||
          existing.body !== input.body ||
          JSON.stringify(existing.data) !== JSON.stringify(input.data ?? {})
        ) {
          throw new ConflictException(
            'Notification idempotency key was already used for different content',
          );
        }
        return existing;
      }

      const notification = await notificationRepository.findOneByOrFail({
        id: inserted[0].id,
      });

      await this.outbox.append(manager, {
        eventName: 'notification.created',
        aggregateId: notification.id,
        correlationId: input.correlationId,
        payload: { notificationId: notification.id },
      });

      return notification;
    });
  }

  async process(notificationId: string): Promise<void> {
    const notification = await this.notifications.findOneBy({
      id: notificationId,
    });
    if (!notification) {
      throw new NotFoundException('Notification was not found');
    }

    await this.notifications.update(
      { id: notificationId },
      {
        processingStatus: 'Processed',
        processedAt: new Date(),
        attempts: () => '"attempts" + 1',
        lastFailure: null,
        updatedAt: new Date(),
      },
    );
  }

  async recordFailure(input: {
    notificationId: string;
    reason: string;
    terminal: boolean;
  }): Promise<void> {
    const status = input.terminal ? 'Failed' : 'Retrying';
    const rows = await this.notifications.update(
      { id: input.notificationId },
      {
        processingStatus: status,
        attempts: () => '"attempts" + 1',
        lastFailure: input.reason.slice(0, 2_000),
        updatedAt: new Date(),
      },
    );
    if (rows.affected) {
      this.logger.error(
        JSON.stringify({
          notificationId: input.notificationId,
          status,
          reason: input.reason.slice(0, 500),
        }),
      );
    }
  }

  async enqueue(notificationId: string): Promise<string> {
    return this.queues.enqueue(
      AsyncQueueName.Notifications,
      'deliver-notification',
      { notificationId },
      { jobId: notificationId },
    );
  }

  private validateInput(input: CreateNotificationInput): void {
    this.validateCategory(input.category);
    if (!input.userId || !input.correlationId) {
      throw new TypeError('Notification user and correlation IDs are required');
    }
    if (!input.idempotencyKey || input.idempotencyKey.length > 160) {
      throw new TypeError('Notification idempotency key is invalid');
    }
    if (!input.title.trim() || input.title.length > 240 || !input.body.trim()) {
      throw new TypeError('Notification title or body is invalid');
    }
  }

  private validateCategory(category: string): void {
    if (!/^[a-z][a-z0-9_.-]{0,99}$/.test(category)) {
      throw new TypeError('Notification category is invalid');
    }
  }
}
