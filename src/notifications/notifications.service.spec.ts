import { NotificationsService } from './notifications.service.js';

function createService(preference: Record<string, unknown> | null = null) {
  const notifications = {
    findOneBy: vi.fn(),
    findAndCount: vi.fn(),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
  };
  const preferences = {
    upsert: vi.fn(),
    findOneBy: vi.fn(),
    find: vi.fn(),
  };
  const manager = {
    getRepository: vi.fn((entity) =>
      entity.name === 'NotificationPreferenceEntity'
        ? { findOneBy: vi.fn().mockResolvedValue(preference) }
        : {
            findOneBy: vi.fn().mockResolvedValue({
              id: 'notification-existing',
              category: 'application.status',
              title: 'Application submitted',
              body: 'Your application was received.',
              data: {},
            }),
            findOneByOrFail: vi
              .fn()
              .mockResolvedValue({ id: 'notification-1' }),
          },
    ),
    query: vi.fn().mockResolvedValue([{ id: 'notification-1' }]),
  };
  const dataSource = {
    transaction: vi.fn((callback) => callback(manager)),
  };
  const outbox = { append: vi.fn() };
  const queues = { enqueue: vi.fn().mockResolvedValue('job-1') };
  const service = new NotificationsService(
    dataSource as never,
    notifications as never,
    preferences as never,
    outbox as never,
    queues as never,
  );
  return { service, notifications, preferences, manager, outbox, queues };
}

describe('NotificationsService', () => {
  it('persists inbox delivery and outbox event with default preferences', async () => {
    const { service, manager, outbox } = createService();

    await expect(
      service.create({
        userId: 'user-1',
        idempotencyKey: 'application:application-1:submitted',
        category: 'application.status',
        title: 'Application submitted',
        body: 'Your application was received.',
        correlationId: 'request-1',
      }),
    ).resolves.toEqual({ id: 'notification-1' });

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'ON CONFLICT ("userId", "idempotencyKey") DO NOTHING',
      ),
      expect.arrayContaining([true, false, 'NotRequested']),
    );
    expect(outbox.append).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventName: 'notification.created',
        aggregateId: 'notification-1',
      }),
    );
  });

  it('does not append another outbox event when the idempotency key already exists', async () => {
    const { service, manager, outbox } = createService();
    manager.query.mockResolvedValueOnce([]);
    await expect(
      service.create({
        userId: 'user-1',
        idempotencyKey: 'same-event',
        category: 'application.status',
        title: 'Application submitted',
        body: 'Your application was received.',
        correlationId: 'request-1',
      }),
    ).resolves.toMatchObject({ id: 'notification-existing' });
    expect(outbox.append).not.toHaveBeenCalled();
  });

  it('applies saved per-user channel preferences and records email provider absence', async () => {
    const { service, manager } = createService({
      inboxEnabled: false,
      emailEnabled: true,
    });

    await service.create({
      userId: 'user-1',
      idempotencyKey: 'event-2',
      category: 'application.status',
      title: 'Application submitted',
      body: 'Your application was received.',
      correlationId: 'request-2',
    });

    expect(manager.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([false, true, 'NotConfigured']),
    );
  });

  it('rejects reuse of an idempotency key with a different notification payload', async () => {
    const { service, manager } = createService();
    manager.query.mockResolvedValueOnce([]);

    await expect(
      service.create({
        userId: 'user-1',
        idempotencyKey: 'same-event',
        category: 'application.status',
        title: 'Different title',
        body: 'Different payload',
        correlationId: 'request-1',
      }),
    ).rejects.toThrow('already used for different content');
  });

  it('scopes inbox reads to the user and bounds pagination', async () => {
    const { service, notifications } = createService();
    notifications.findAndCount.mockResolvedValue([
      [{ id: 'notification-1' }],
      1,
    ]);

    await expect(service.listInbox('user-1', 2, 10)).resolves.toEqual({
      items: [{ id: 'notification-1' }],
      total: 1,
      page: 2,
      pageSize: 10,
    });
    expect(notifications.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', inboxEnabled: true },
        skip: 10,
        take: 10,
      }),
    );
    await expect(service.listInbox('user-1', 1, 101)).rejects.toThrow(
      RangeError,
    );
  });

  it('persists retry and terminal failure states for operational monitoring', async () => {
    const { service, notifications } = createService();

    await service.recordFailure({
      notificationId: 'notification-1',
      reason: 'Redis or worker failure',
      terminal: false,
    });
    await service.recordFailure({
      notificationId: 'notification-1',
      reason: 'Permanent processing failure',
      terminal: true,
    });

    expect(notifications.update).toHaveBeenNthCalledWith(
      1,
      { id: 'notification-1' },
      expect.objectContaining({ processingStatus: 'Retrying' }),
    );
    expect(notifications.update).toHaveBeenNthCalledWith(
      2,
      { id: 'notification-1' },
      expect.objectContaining({ processingStatus: 'Failed' }),
    );
  });

  it('rejects invalid categories and malformed notification content', async () => {
    const { service } = createService();

    await expect(
      service.create({
        userId: 'user-1',
        idempotencyKey: 'event-1',
        category: '../private',
        title: 'Title',
        body: 'Body',
        correlationId: 'request-1',
      }),
    ).rejects.toThrow(TypeError);
    await expect(
      service.create({
        userId: 'user-1',
        idempotencyKey: 'event-1',
        category: 'valid',
        title: ' ',
        body: 'Body',
        correlationId: 'request-1',
      }),
    ).rejects.toThrow(TypeError);
  });
});
