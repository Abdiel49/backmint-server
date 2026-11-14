import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AuthSessionService } from '../src/identity/auth-session.service.js';
import { AuthSessionGuard } from '../src/identity/auth-session.guard.js';
import { OrganizationMembershipEntity } from '../src/organizations/organization-membership.entity.js';
import { CallEntity } from '../src/publications/call.entity.js';
import { ProjectEntity } from '../src/publications/project.entity.js';
import { PublicationManagementController } from '../src/publications/publication-management.controller.js';
import { PublicationManagementService } from '../src/publications/publication-management.service.js';
import { PublicationService } from '../src/publications/publication.service.js';
import { validatePublication } from '../src/publications/publication.validation.js';

const projectId = '5f3f652e-b349-4fb6-81b9-91c27652d0a8';
const callId = 'af039c3e-9663-46f1-9cd8-16a9f7e96530';
const organizationId = '7c6f2ef9-1918-45da-88f4-dfa0474bd9d5';
const userProjectId = '0c824c9d-a723-4cf1-a2c6-ea7a25386667';

describe('Publication management HTTP authorization (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const projects = new Map([
      [projectId, { id: projectId, ownerOrganizationId: organizationId, ownerUserId: undefined }],
      [userProjectId, { id: userProjectId, ownerOrganizationId: undefined, ownerUserId: 'user-owner' }],
    ]);
    const calls = new Map([
      [callId, { id: callId, ownerOrganizationId: organizationId, ownerUserId: undefined }],
    ]);
    const projectRepository = { findOne: vi.fn(async ({ where }: { where: { id: string } }) => projects.get(where.id) ?? null) };
    const callRepository = { findOne: vi.fn(async ({ where }: { where: { id: string } }) => calls.get(where.id) ?? null) };
    const membershipRepository = {
      findOne: vi.fn(async ({ where }: { where: { organizationId: string; userId: string } }) => {
        if (where.organizationId !== organizationId) return null;
        if (where.userId === 'user-manager') return { role: 'ProjectManager', status: 'Active' };
        if (where.userId === 'user-admin') return { role: 'Admin', status: 'Active' };
        if (where.userId === 'user-unrelated') return null;
        return null;
      }),
    };
    const dataSource = {
      getRepository: (entity: typeof ProjectEntity | typeof CallEntity | typeof OrganizationMembershipEntity) => {
        if (entity === ProjectEntity) return projectRepository;
        if (entity === CallEntity) return callRepository;
        return membershipRepository;
      },
    };
    const publicationService = {
      createProject: vi.fn(async (input) => {
        validatePublication({ ...input, sourceType: 'Project', lifecycleStatus: 'Draft', intakeStatus: 'Open', hardCapEnabled: input.hardCapEnabled ?? false }, 'Project');
        return { id: projectId, ...input, lifecycleStatus: 'Draft', intakeStatus: 'Open' };
      }),
      createCall: vi.fn(async (input) => {
        validatePublication({ ...input, sourceType: 'Call', lifecycleStatus: 'Draft', intakeStatus: 'Open', hardCapEnabled: input.hardCapEnabled ?? false }, 'Call');
        return { id: callId, ...input, lifecycleStatus: 'Draft', intakeStatus: 'Open' };
      }),
      updateProject: vi.fn(async (id, changes) => ({ id, ...changes })),
      updateCall: vi.fn(async (id, changes) => ({ id, ...changes })),
      publishProject: vi.fn(async (id) => ({ id, lifecycleStatus: 'Published' })),
      publishCall: vi.fn(async (id) => ({ id, lifecycleStatus: 'Published' })),
      setProjectVisibility: vi.fn(async (id, visibility) => ({ id, visibility, intakeStatus: 'Open' })),
      setCallVisibility: vi.fn(async (id, visibility) => ({ id, visibility, intakeStatus: 'Open' })),
      setProjectIntake: vi.fn(async (id, intakeStatus) => ({ id, visibility: 'Private', intakeStatus })),
      setCallIntake: vi.fn(async (id, intakeStatus) => ({ id, visibility: 'Private', intakeStatus })),
      transitionProject: vi.fn(async (id, lifecycleStatus) => ({ id, lifecycleStatus })),
      transitionCall: vi.fn(async (id, lifecycleStatus) => ({ id, lifecycleStatus })),
    };

    const module = await Test.createTestingModule({
      controllers: [PublicationManagementController],
      providers: [
        PublicationManagementService,
        AuthSessionGuard,
        { provide: PublicationService, useValue: publicationService },
        {
          provide: AuthSessionService,
          useValue: {
            authenticate: vi.fn(async (token: string) => {
              const userId = ({
                'owner-token': 'user-owner',
                'manager-token': 'user-manager',
                'admin-token': 'user-admin',
                'unrelated-token': 'user-unrelated',
              } as Record<string, string>)[token];
              return userId ? { id: `${userId}-session`, userId } : null;
            }),
          },
        },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => app.close());

  it('rejects anonymous management requests', async () => {
    await request(app.getHttpServer()).patch(`/api/projects/${userProjectId}`).send({ title: 'Updated' }).expect(401);
  });

  it('allows an individual owner and an authorized organization ProjectManager', async () => {
    await request(app.getHttpServer()).patch(`/api/projects/${userProjectId}`).set('Authorization', 'Bearer owner-token').send({ title: 'Owner update' }).expect(200);
    await request(app.getHttpServer()).patch(`/api/projects/${projectId}`).set('Authorization', 'Bearer manager-token').send({ title: 'Organization update' }).expect(200);
  });

  it('creates Project and Call independently with server established ownership', async () => {
    const projectResponse = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', 'Bearer owner-token')
      .send({
        title: 'Independent Solar Project',
        description: 'A standalone project with no Call aggregate.',
        direction: 'FundingRequested',
        visibility: 'Private',
        objectives: ['Install community solar panels'],
      })
      .expect(201);
    expect(projectResponse.body).toMatchObject({ ownerUserId: 'user-owner' });
    expect(projectResponse.body.ownerOrganizationId).toBeUndefined();

    const callResponse = await request(app.getHttpServer())
      .post('/api/calls')
      .set('Authorization', 'Bearer manager-token')
      .send({
        ownerOrganizationId: organizationId,
        title: 'Independent Solar Call',
        description: 'A standalone call with no Project aggregate.',
        direction: 'FundingOffered',
        visibility: 'Private',
        audienceTypes: ['Community'],
        supportTypes: ['Grant'],
      })
      .expect(201);
    expect(callResponse.body).toMatchObject({ ownerOrganizationId: organizationId });
    expect(callResponse.body.ownerUserId).toBeUndefined();
  });

  it('allows an organization Admin and rejects an unrelated organization user', async () => {
    await request(app.getHttpServer()).patch(`/api/calls/${callId}/intake`).set('Authorization', 'Bearer admin-token').send({ intakeStatus: 'Paused' }).expect(200);
    await request(app.getHttpServer()).patch(`/api/calls/${callId}/intake`).set('Authorization', 'Bearer unrelated-token').send({ intakeStatus: 'Closed' }).expect(403);
  });

  it('keeps Project and Call identifiers in their independent aggregates', async () => {
    await request(app.getHttpServer()).patch(`/api/calls/${projectId}/visibility`).set('Authorization', 'Bearer manager-token').send({ visibility: 'Public' }).expect(404);
  });

  it('rejects client supplied actor ownership and invalid funding direction or policy', async () => {
    const validProject = {
      title: 'Solar Pilot',
      description: 'A community energy installation.',
      direction: 'FundingRequested',
      visibility: 'Private',
      objectives: ['Install solar panels'],
    };
    await request(app.getHttpServer()).post('/api/projects').set('Authorization', 'Bearer owner-token').send({ ...validProject, ownerUserId: 'victim-user' }).expect(400);
    await request(app.getHttpServer()).post('/api/projects').set('Authorization', 'Bearer owner-token').send({ ...validProject, direction: 'Other' }).expect(400);
    await request(app.getHttpServer()).post('/api/projects').set('Authorization', 'Bearer owner-token').send({ ...validProject, hardCapEnabled: true, hardCapAmount: '0' }).expect(400);
    await request(app.getHttpServer()).post('/api/calls').set('Authorization', 'Bearer owner-token').send({
      title: 'Solar Call',
      description: 'A funding call with invalid award policy.',
      direction: 'FundingOffered',
      visibility: 'Private',
      audienceTypes: ['Community'],
      supportTypes: ['Grant'],
      maximumAwards: 0,
    }).expect(400);
  });

  it('keeps visibility changes independent from intake changes', async () => {
    const response = await request(app.getHttpServer()).patch(`/api/projects/${projectId}/visibility`).set('Authorization', 'Bearer manager-token').send({ visibility: 'Unlisted' }).expect(200);
    expect(response.body).toMatchObject({ visibility: 'Unlisted', intakeStatus: 'Open' });
  });
});
