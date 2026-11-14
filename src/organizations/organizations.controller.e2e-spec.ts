import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthSessionService } from '../identity/auth-session.service.js';
import { OrganizationMembershipService } from './organization-membership.service.js';
import { OrganizationService } from './organization.service.js';
import { OrganizationsController } from './organizations.controller.js';

describe('OrganizationsController (e2e)', () => {
  let app: INestApplication;
  const organizationService = {
    create: vi.fn(async (userId, input) => ({
      id: 'org-1',
      ownerUserId: userId,
      ...input,
    })),
    listForUser: vi.fn(async () => [
      { id: 'org-1', name: 'Green Futures Bolivia' },
    ]),
  };
  const membershipService = {
    inviteMember: vi.fn(async (actorUserId, organizationId, input) => ({
      id: 'membership-1',
      organizationId,
      invitedByUserId: actorUserId,
      ...input,
      status: 'Invited',
    })),
    acceptInvitation: vi.fn(async (actorUserId, membershipId) => ({
      id: membershipId,
      userId: actorUserId,
      status: 'Active',
    })),
    changeRole: vi.fn(async (actorUserId, membershipId, role) => ({
      id: membershipId,
      actorUserId,
      role,
    })),
    revokeMembership: vi.fn(async (actorUserId, membershipId) => ({
      id: membershipId,
      actorUserId,
      status: 'Revoked',
    })),
  };
  const sessions = {
    authenticate: vi.fn(async (token: string) => {
      if (!token || token === 'invalid') return null;
      return { id: `session-${token}`, userId: token };
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        { provide: OrganizationService, useValue: organizationService },
        { provide: OrganizationMembershipService, useValue: membershipService },
        { provide: AuthSessionService, useValue: sessions },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects anonymous organization access', async () => {
    await request(app.getHttpServer()).get('/api/organizations').expect(401);
  });

  it('creates an organization using the authenticated user as owner', async () => {
    await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', 'Bearer owner-user')
      .send({
        slug: 'green-futures-bolivia',
        name: 'Green Futures Bolivia',
        organizationType: 'Nonprofit',
        country: 'BO',
        legalStatus: 'Incorporated',
        ownerUserId: 'attacker-user',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', 'Bearer owner-user')
      .send({
        slug: 'green-futures-bolivia',
        name: 'Green Futures Bolivia',
        organizationType: 'Nonprofit',
        country: 'BO',
        legalStatus: 'Incorporated',
      })
      .expect(201)
      .expect(({ body }) => expect(body.ownerUserId).toBe('owner-user'));
    expect(organizationService.create).toHaveBeenCalledWith(
      'owner-user',
      expect.objectContaining({ slug: 'green-futures-bolivia' }),
    );
  });

  it('lists only the authenticated user’s organizations', async () => {
    await request(app.getHttpServer())
      .get('/api/organizations')
      .set('Authorization', 'Bearer member-user')
      .expect(200);
    expect(organizationService.listForUser).toHaveBeenCalledWith('member-user');
  });

  it('passes invitation actor and invitee as separate identities', async () => {
    await request(app.getHttpServer())
      .post(
        '/api/organizations/a54e27b4-2c0a-4d66-a9ab-8c98fb6281e8/memberships',
      )
      .set('Authorization', 'Bearer admin-user')
      .send({
        userId: 'd899b174-ff35-4c79-9b42-262f694281d5',
        role: 'Evaluator',
      })
      .expect(201);
    expect(membershipService.inviteMember).toHaveBeenCalledWith(
      'admin-user',
      'a54e27b4-2c0a-4d66-a9ab-8c98fb6281e8',
      { userId: 'd899b174-ff35-4c79-9b42-262f694281d5', role: 'Evaluator' },
    );
  });

  it('accepts an invitation using the caller identity and blocks invalid sessions', async () => {
    await request(app.getHttpServer())
      .post(
        '/api/organizations/memberships/f92f7e44-bef9-46a3-8e25-f346161ce716/accept',
      )
      .set('Authorization', 'Bearer invited-user')
      .expect(200);
    expect(membershipService.acceptInvitation).toHaveBeenCalledWith(
      'invited-user',
      'f92f7e44-bef9-46a3-8e25-f346161ce716',
    );
    await request(app.getHttpServer())
      .get('/api/organizations')
      .set('Authorization', 'Bearer invalid')
      .expect(401);
  });

  it('changes roles and revokes memberships through authenticated routes', async () => {
    await request(app.getHttpServer())
      .patch(
        '/api/organizations/memberships/f92f7e44-bef9-46a3-8e25-f346161ce716/role',
      )
      .set('Authorization', 'Bearer admin-user')
      .send({ role: 'ProjectManager' })
      .expect(200);
    expect(membershipService.changeRole).toHaveBeenCalledWith(
      'admin-user',
      'f92f7e44-bef9-46a3-8e25-f346161ce716',
      'ProjectManager',
    );

    await request(app.getHttpServer())
      .patch(
        '/api/organizations/memberships/f92f7e44-bef9-46a3-8e25-f346161ce716/role',
      )
      .set('Authorization', 'Bearer admin-user')
      .send({ role: 'Owner' })
      .expect(400);

    await request(app.getHttpServer())
      .delete(
        '/api/organizations/memberships/f92f7e44-bef9-46a3-8e25-f346161ce716',
      )
      .set('Authorization', 'Bearer owner-user')
      .expect(200);
    expect(membershipService.revokeMembership).toHaveBeenCalledWith(
      'owner-user',
      'f92f7e44-bef9-46a3-8e25-f346161ce716',
    );
  });

  afterAll(async () => {
    await app.close();
  });
});
