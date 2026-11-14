import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { OutcomeClaimsController } from '../src/impact/outcome-claims.controller.js';
import { OutcomeClaimsHttpService } from '../src/impact/outcome-claims-http.service.js';
import { OutcomeClaimService } from '../src/impact/outcome-claim.service.js';
import { OutcomeClaimEntity } from '../src/impact/outcome-claim.entity.js';
import { OrganizationEntity } from '../src/organizations/organization.entity.js';
import { OrganizationMembershipEntity } from '../src/organizations/organization-membership.entity.js';
import { ProjectEntity } from '../src/publications/project.entity.js';
import { CallEntity } from '../src/publications/call.entity.js';
import { AuthSessionGuard } from '../src/identity/auth-session.guard.js';
import { AuthSessionService } from '../src/identity/auth-session.service.js';

describe('Outcome claims authorization API', () => {
  const organizationId = '7a93fc29-42a1-4be9-901f-450e261dcd07';
  const claimId = '5c36f41c-95d4-4cc4-8b4a-dc09187d89d6';
  const sourceId = 'f64f0d7f-d6f1-4c33-b27e-9aefb8b1f11c';
  const claimantId = 'f2625a81-2af8-4c5b-943a-07c4763fce29';
  const users = new Map([
    ['observer-token', { id: 'observer-session', userId: 'observer-user' }],
    ['evaluator-token', { id: 'evaluator-session', userId: 'evaluator-user' }],
    ['outsider-token', { id: 'outsider-session', userId: 'outsider-user' }],
  ]);
  let app: INestApplication;
  const queryExpressions: string[] = [];
  const claim = Object.assign(new OutcomeClaimEntity(), {
    id: claimId,
    sourceType: 'Call' as const,
    sourceId,
    claimedByUserId: claimantId,
    metricType: 'households_reached',
    value: '1250.5',
    unit: 'people',
    evidenceStorageKey: 'private/outcomes/report.pdf',
    evidenceSha256: 'a'.repeat(64),
    provenance: 'SelfReported',
    verifierUserId: null,
    verificationNote: null,
    verifiedAt: null,
    createdAt: new Date('2026-11-14T12:00:00.000Z'),
  });

  beforeAll(async () => {
    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === OrganizationEntity)
          return {
            findOneBy: vi.fn(async () => ({
              id: organizationId,
              ownerUserId: 'owner-user',
            })),
          };
        if (entity === OrganizationMembershipEntity)
          return {
            findOneBy: vi.fn(async ({ userId }: { userId: string }) => {
              if (userId === 'observer-user')
                return {
                  organizationId,
                  userId,
                  role: 'Observer',
                  status: 'Active',
                };
              if (userId === 'evaluator-user')
                return {
                  organizationId,
                  userId,
                  role: 'Evaluator',
                  status: 'Active',
                };
              return null;
            }),
          };
        if (entity === CallEntity || entity === ProjectEntity)
          return {
            findOneBy: vi.fn(async () => ({
              id: sourceId,
              ownerOrganizationId: organizationId,
            })),
          };
        if (entity === OutcomeClaimEntity) {
          const builder = {
            where: (expression: string) => {
              queryExpressions.push(expression);
              return builder;
            },
            andWhere: (expression: string) => {
              queryExpressions.push(expression);
              return builder;
            },
            orderBy: () => builder,
            addOrderBy: () => builder,
            take: () => builder,
            skip: () => builder,
            getManyAndCount: async () => [[claim], 1],
          };
          return {
            findOneBy: vi.fn(async () => claim),
            createQueryBuilder: () => builder,
          };
        }
        throw new Error('Unexpected repository');
      },
    };
    const dataSource = {
      transaction: (work: (value: typeof manager) => unknown) => work(manager),
      manager,
      getRepository: (entity: unknown) => manager.getRepository(entity),
    };
    const outcomeService = {
      createSelfReported: vi.fn(async (_manager, input) =>
        Object.assign(new OutcomeClaimEntity(), claim, {
          claimedByUserId: input.claimedByUserId,
        }),
      ),
      review: vi.fn(async (_input) =>
        Object.assign(new OutcomeClaimEntity(), claim, {
          provenance: 'Reviewed',
          verifierUserId: 'evaluator-user',
          verifiedAt: new Date(),
        }),
      ),
    };
    const module = await Test.createTestingModule({
      controllers: [OutcomeClaimsController],
      providers: [
        OutcomeClaimsHttpService,
        { provide: DataSource, useValue: dataSource },
        { provide: OutcomeClaimService, useValue: outcomeService },
        {
          provide: AuthSessionService,
          useValue: {
            authenticate: vi.fn(
              async (token: string) => users.get(token) ?? null,
            ),
          },
        },
        AuthSessionGuard,
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => app.close());

  it('requires a bearer session and hides organization existence from nonmembers', async () => {
    await request(app.getHttpServer())
      .get(`/api/organizations/${organizationId}/outcome-claims`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/organizations/${organizationId}/outcome-claims`)
      .set('Authorization', 'Bearer outsider-token')
      .expect(404);
  });

  it('allows scoped disclosure-safe reads and blocks unauthorized review', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/organizations/${organizationId}/outcome-claims`)
      .set('Authorization', 'Bearer observer-token')
      .expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).not.toHaveProperty('evidenceStorageKey');
    expect(list.body.items[0]).not.toHaveProperty('verificationNote');

    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/outcome-claims/${claimId}/reviews`,
      )
      .set('Authorization', 'Bearer observer-token')
      .send({ note: 'Evidence checked.' })
      .expect(403);
  });

  it('applies optional source filters to both source ownership branches', async () => {
    const previousExpressionCount = queryExpressions.length;
    await request(app.getHttpServer())
      .get(
        `/api/organizations/${organizationId}/outcome-claims?sourceType=Call&sourceId=${sourceId}`,
      )
      .set('Authorization', 'Bearer observer-token')
      .expect(200);
    const expressions = queryExpressions.slice(previousExpressionCount);
    expect(expressions[0]).toMatch(
      /^\(EXISTS \([\s\S]+\) OR EXISTS \([\s\S]+\)\)$/,
    );
    expect(expressions.slice(1)).toEqual([
      'claim."sourceType" = :sourceType',
      'claim."sourceId" = :sourceId',
    ]);
  });

  it('allows an authorized evaluator to record Reviewed provenance only', async () => {
    const result = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/outcome-claims/${claimId}/reviews`,
      )
      .set('Authorization', 'Bearer evaluator-token')
      .send({ note: 'Reviewed the monitoring report.' })
      .expect(201);
    expect(result.body.provenance).toBe('Reviewed');
    expect(result.body).not.toHaveProperty('evidenceStorageKey');
  });

  it('publishes bearer security and realistic request, success, and error examples', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    const create =
      document.paths['/api/organizations/{organizationId}/outcome-claims']
        ?.post;
    const list =
      document.paths['/api/organizations/{organizationId}/outcome-claims']?.get;
    const review =
      document.paths[
        '/api/organizations/{organizationId}/outcome-claims/{claimId}/reviews'
      ]?.post;

    expect(Object.keys(document.paths)).toEqual([
      '/api/organizations/{organizationId}/outcome-claims',
      '/api/organizations/{organizationId}/outcome-claims/{claimId}/reviews',
    ]);

    expect(create?.security).toEqual([{ bearer: [] }]);
    expect(
      create?.requestBody?.content?.['application/json']?.examples,
    ).toHaveProperty('solarImpact');
    expect(
      create?.responses?.['201']?.content?.['application/json']?.schema
        ?.example,
    ).toMatchObject({ provenance: 'SelfReported' });
    expect(
      create?.responses?.['403']?.content?.['application/json']?.schema
        ?.example,
    ).toMatchObject({ statusCode: 403 });
    expect(
      list?.responses?.['200']?.content?.['application/json']?.schema?.example,
    ).toMatchObject({ items: [{ provenance: 'SelfReported' }] });
    expect(review?.security).toEqual([{ bearer: [] }]);
    expect(
      review?.requestBody?.content?.['application/json']?.examples,
    ).toHaveProperty('evidenceReviewed');
    expect(
      review?.responses?.['201']?.content?.['application/json']?.schema
        ?.example,
    ).toMatchObject({ provenance: 'Reviewed' });
    expect(
      review?.responses?.['409']?.content?.['application/json']?.schema
        ?.example,
    ).toMatchObject({ statusCode: 409 });
  });
});
