import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthSessionService } from '../identity/auth-session.service.js';
import { ParticipationService } from './participation.service.js';
import { ApplicationLifecycleController } from './application-lifecycle.controller.js';

describe('ApplicationLifecycleController', () => {
  let app: INestApplication;
  const participation = {
    withdrawApplication: vi.fn(async (id: string) => ({
      id,
      status: 'Withdrawn',
      receipt: 'receipt-original',
      withdrawnAt: new Date('2026-11-14T17:25:00.000Z'),
    })),
    resubmitApplication: vi.fn(async (id: string, userId: string) => ({
      id: 'application-new',
      supersedesApplicationId: id,
      status: 'Submitted',
      receipt: 'receipt-new',
      sourceVersion: 4,
      submittedAt: new Date('2026-11-14T17:30:00.000Z'),
      userId,
    })),
  };
  const sessions = {
    authenticate: vi.fn(async (token: string) =>
      token === 'valid' ? { id: 'session-1', userId: 'user-1' } : null,
    ),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ApplicationLifecycleController],
      providers: [
        { provide: ParticipationService, useValue: participation },
        { provide: AuthSessionService, useValue: sessions },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  beforeEach(() => vi.clearAllMocks());

  afterAll(async () => app.close());

  it('requires an authenticated session before withdrawal', async () => {
    await request(app.getHttpServer())
      .post('/api/applications/7e03b45b-40f4-4243-818b-9502dc744ad3/withdraw')
      .expect(401);
    expect(participation.withdrawApplication).not.toHaveBeenCalled();
  });

  it('passes the session actor to the withdrawal operation', async () => {
    await request(app.getHttpServer())
      .post('/api/applications/7e03b45b-40f4-4243-818b-9502dc744ad3/withdraw')
      .set('Authorization', 'Bearer valid')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: 'Withdrawn',
          receipt: 'receipt-original',
        });
      });
    expect(participation.withdrawApplication).toHaveBeenCalledWith(
      '7e03b45b-40f4-4243-818b-9502dc744ad3',
      'user-1',
    );
  });

  it('accepts a realistic resubmission payload and uses the session identity', async () => {
    await request(app.getHttpServer())
      .post(
        '/api/applications/7e03b45b-40f4-4243-818b-9502dc744ad3/resubmissions',
      )
      .set('Authorization', 'Bearer valid')
      .send({
        proposal: { projectPlan: 'Install solar panels at three schools.' },
        answers: [{ questionKey: 'community', answer: '420 students' }],
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          supersedesApplicationId: '7e03b45b-40f4-4243-818b-9502dc744ad3',
          status: 'Submitted',
          receipt: 'receipt-new',
        });
      });
    expect(participation.resubmitApplication).toHaveBeenCalledWith(
      '7e03b45b-40f4-4243-818b-9502dc744ad3',
      'user-1',
      {
        proposal: { projectPlan: 'Install solar panels at three schools.' },
        answers: [{ questionKey: 'community', answer: '420 students' }],
      },
    );
  });

  it('rejects malformed identifiers and request bodies', async () => {
    await request(app.getHttpServer())
      .post('/api/applications/not-a-uuid/withdraw')
      .set('Authorization', 'Bearer valid')
      .expect(400);
    await request(app.getHttpServer())
      .post(
        '/api/applications/7e03b45b-40f4-4243-818b-9502dc744ad3/resubmissions',
      )
      .set('Authorization', 'Bearer valid')
      .send({ proposal: [] })
      .expect(400);
    await request(app.getHttpServer())
      .post(
        '/api/applications/7e03b45b-40f4-4243-818b-9502dc744ad3/resubmissions',
      )
      .set('Authorization', 'Bearer valid')
      .send({ proposal: {}, answers: [{ questionKey: 'community' }] })
      .expect(400);
  });
});
