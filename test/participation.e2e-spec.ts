import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AuthSessionGuard } from '../src/identity/auth-session.guard.js';
import { AuthSessionService } from '../src/identity/auth-session.service.js';
import { ParticipationService } from '../src/publications/participation.service.js';
import { ParticipationController } from '../src/participation/participation.controller.js';
import { ParticipationHttpService } from '../src/participation/participation-http.service.js';
import { ProjectEntity } from '../src/publications/project.entity.js';
import { CallEntity } from '../src/publications/call.entity.js';
import {
  ApplicationAnswerEntity,
  ApplicationEntity,
  FundingOfferEntity,
} from '../src/publications/application.entity.js';
import { OrganizationMembershipEntity } from '../src/organizations/organization-membership.entity.js';
import { OrganizationRepresentativeEntity } from '../src/organizations/organization-representative.entity.js';

const applicant = 'f2625a81-2af8-4c5b-943a-07c4763fce29';
const otherApplicant = '18e5f7cb-c822-4d8f-b68d-71efbf002bdb';
const organizationId = 'cb3662f4-d5b7-4ee8-9cf7-858a81a847a7';
const sourceId = 'f64f0d7f-d6f1-4c33-b27e-9aefb8b1f11c';
const offerId = 'e7b15140-2f20-45b3-8fb0-25da8d681574';

describe('Participation API (e2e)', () => {
  let app: INestApplication;
  let actor: string;
  let source: Record<string, unknown>;
  let offer: Record<string, unknown> | null;
  let membership: Record<string, unknown> | null;
  let applicationRows: Array<Record<string, unknown>>;
  let submitApplication: ReturnType<typeof vi.fn>;
  let submitFundingOffer: ReturnType<typeof vi.fn>;
  let reviewFundingOffer: ReturnType<typeof vi.fn>;
  let applicationQuery: {
    where: ReturnType<typeof vi.fn>;
    orWhere: ReturnType<typeof vi.fn>;
    orderBy: ReturnType<typeof vi.fn>;
    take: ReturnType<typeof vi.fn>;
    skip: ReturnType<typeof vi.fn>;
    getManyAndCount: ReturnType<typeof vi.fn>;
  };
  let offerQuery: typeof applicationQuery;

  beforeEach(async () => {
    actor = applicant;
    source = {
      id: sourceId,
      direction: 'FundingOffered',
      visibility: 'Public',
      ownerUserId: undefined,
      ownerOrganizationId: undefined,
    };
    offer = null;
    membership = null;
    applicationRows = [
      {
        id: '71d94885-9e19-4827-bdbb-3de3d5333e3b',
        applicantUserId: applicant,
      },
      {
        id: 'd12f7d33-3127-47ca-9480-bb3671924f10',
        applicantUserId: otherApplicant,
      },
    ];
    submitApplication = vi.fn().mockResolvedValue({
      id: '71d94885-9e19-4827-bdbb-3de3d5333e3b',
      status: 'Submitted',
    });
    submitFundingOffer = vi
      .fn()
      .mockResolvedValue({ id: offerId, status: 'Submitted' });
    reviewFundingOffer = vi
      .fn()
      .mockResolvedValue({ id: offerId, status: 'Accepted' });
    applicationQuery = {
      where: vi.fn().mockReturnThis(),
      orWhere: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      getManyAndCount: vi
        .fn()
        .mockImplementation(() => [
          applicationRows.filter((row) => row.applicantUserId === actor),
          1,
        ]),
    };
    offerQuery = {
      where: vi.fn().mockReturnThis(),
      orWhere: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      getManyAndCount: vi
        .fn()
        .mockResolvedValue([[{ id: offerId, funderUserId: applicant }], 1]),
    };

    const repositories = new Map<unknown, Record<string, unknown>>([
      [ProjectEntity, { findOneBy: vi.fn().mockImplementation(() => source) }],
      [CallEntity, { findOneBy: vi.fn().mockImplementation(() => source) }],
      [
        OrganizationMembershipEntity,
        { findOneBy: vi.fn().mockImplementation(() => membership) },
      ],
      [OrganizationRepresentativeEntity, { findOneBy: vi.fn().mockResolvedValue(null) }],
      [
        FundingOfferEntity,
        {
          findOneBy: vi.fn().mockImplementation(() => offer),
          createQueryBuilder: vi.fn(() => offerQuery),
        },
      ],
      [
        ApplicationEntity,
        { createQueryBuilder: vi.fn(() => applicationQuery) },
      ],
      [ApplicationAnswerEntity, { findBy: vi.fn().mockResolvedValue([]) }],
    ]);
    const dataSource = {
      getRepository: vi.fn((entity: unknown) => repositories.get(entity)),
    };
    const sessions = {
      authenticate: vi.fn((token: string) =>
        token === 'caller-token' ? { id: 'session-id', userId: actor } : null,
      ),
    };
    const participation = {
      submitApplication,
      submitFundingOffer,
      reviewFundingOffer,
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ParticipationController],
      providers: [
        ParticipationHttpService,
        AuthSessionGuard,
        { provide: DataSource, useValue: dataSource },
        { provide: ParticipationService, useValue: participation },
        { provide: AuthSessionService, useValue: sessions },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => app.close());

  it('rejects anonymous requests', async () => {
    await request(app.getHttpServer())
      .post('/api/applications')
      .send({})
      .expect(401);
  });

  it('rejects a source with the wrong funding direction', async () => {
    source = { ...source, direction: 'FundingRequested' };
    await request(app.getHttpServer())
      .post('/api/applications')
      .set('Authorization', 'Bearer caller-token')
      .send({ sourceType: 'Call', sourceId, proposal: {}, answers: [] })
      .expect(400);
    expect(submitApplication).not.toHaveBeenCalled();
  });

  it('rejects an unrelated organization membership', async () => {
    membership = null;
    await request(app.getHttpServer())
      .post('/api/applications')
      .set('Authorization', 'Bearer caller-token')
      .send({
        sourceType: 'Call',
        sourceId,
        applicantOrganizationId: organizationId,
        proposal: {},
        answers: [],
      })
      .expect(403);
    expect(submitApplication).not.toHaveBeenCalled();
  });

  it('rejects an inactive organization membership', async () => {
    membership = {
      organizationId,
      userId: applicant,
      status: 'Suspended',
      role: 'Admin',
    };
    await request(app.getHttpServer())
      .post('/api/applications')
      .set('Authorization', 'Bearer caller-token')
      .send({
        sourceType: 'Call',
        sourceId,
        applicantOrganizationId: organizationId,
        proposal: {},
        answers: [],
      })
      .expect(403);
    expect(submitApplication).not.toHaveBeenCalled();
  });

  it('requires verified, unexpired authority for a Representative membership', async () => {
    membership = {
      organizationId,
      userId: applicant,
      status: 'Active',
      role: 'Representative',
    };
    await request(app.getHttpServer())
      .post('/api/applications')
      .set('Authorization', 'Bearer caller-token')
      .send({
        sourceType: 'Call',
        sourceId,
        applicantOrganizationId: organizationId,
        proposal: {},
        answers: [],
      })
      .expect(403);
  });

  it('passes the authenticated user as applicant and ignores no caller-supplied identity', async () => {
    await request(app.getHttpServer())
      .post('/api/applications')
      .set('Authorization', 'Bearer caller-token')
      .send({ sourceType: 'Call', sourceId, proposal: {}, answers: [] })
      .expect(201);
    expect(submitApplication).toHaveBeenCalledWith(
      expect.objectContaining({ applicantUserId: applicant }),
    );
  });

  it('submits a FundingOffer using the authenticated user as funder', async () => {
    source = { ...source, direction: 'FundingRequested' };
    await request(app.getHttpServer())
      .post('/api/funding-offers')
      .set('Authorization', 'Bearer caller-token')
      .send({
        sourceType: 'Call',
        sourceId,
        amount: '2500000',
        asset: 'NEAR',
        conditions: {},
      })
      .expect(201);
    expect(submitFundingOffer).toHaveBeenCalledWith(
      expect.objectContaining({ funderUserId: applicant }),
    );
  });

  it('lists only the authenticated caller’s FundingOffers', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/funding-offers')
      .set('Authorization', 'Bearer caller-token')
      .expect(200);
    expect(response.body.items).toEqual([
      { id: offerId, funderUserId: applicant },
    ]);
    expect(offerQuery.where).toHaveBeenCalledWith(
      'offer."funderUserId" = :actorUserId',
      { actorUserId: applicant },
    );
  });

  it('does not reveal or accept participation in a private source', async () => {
    source = { ...source, visibility: 'Private' };
    await request(app.getHttpServer())
      .post('/api/applications')
      .set('Authorization', 'Bearer caller-token')
      .send({ sourceType: 'Call', sourceId, proposal: {}, answers: [] })
      .expect(404);
    expect(submitApplication).not.toHaveBeenCalled();
  });

  it('allows a direct-link submission to an Unlisted source', async () => {
    source = { ...source, visibility: 'Unlisted' };
    await request(app.getHttpServer())
      .post('/api/applications')
      .set('Authorization', 'Bearer caller-token')
      .send({ sourceType: 'Call', sourceId, proposal: {}, answers: [] })
      .expect(201);
  });

  it('rejects caller-supplied applicant user IDs through strict request validation', async () => {
    await request(app.getHttpServer())
      .post('/api/applications')
      .set('Authorization', 'Bearer caller-token')
      .send({
        sourceType: 'Call',
        sourceId,
        applicantUserId: otherApplicant,
        proposal: {},
        answers: [],
      })
      .expect(400);
    expect(submitApplication).not.toHaveBeenCalled();
  });

  it('returns only the caller’s own Applications', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/applications')
      .set('Authorization', 'Bearer caller-token')
      .expect(200);
    expect(response.body.items).toEqual([
      {
        id: '71d94885-9e19-4827-bdbb-3de3d5333e3b',
        applicantUserId: applicant,
        answers: [],
      },
    ]);
    expect(applicationQuery.where).toHaveBeenCalledWith(
      'application."applicantUserId" = :actorUserId',
      { actorUserId: applicant },
    );
  });

  it('blocks FundingOffer review by a source reviewer with an unauthorized role', async () => {
    source = {
      ...source,
      direction: 'FundingRequested',
      ownerOrganizationId: organizationId,
    };
    offer = { id: offerId, sourceType: 'Call', sourceId };
    membership = {
      organizationId,
      userId: applicant,
      status: 'Active',
      role: 'Observer',
    };
    await request(app.getHttpServer())
      .post(`/api/funding-offers/${offerId}/accept`)
      .set('Authorization', 'Bearer caller-token')
      .expect(403);
    expect(reviewFundingOffer).not.toHaveBeenCalled();
  });

  it('permits an active source organization Evaluator to review an offer', async () => {
    source = {
      ...source,
      direction: 'FundingRequested',
      ownerOrganizationId: organizationId,
    };
    offer = { id: offerId, sourceType: 'Call', sourceId };
    membership = {
      organizationId,
      userId: applicant,
      status: 'Active',
      role: 'Evaluator',
    };
    await request(app.getHttpServer())
      .post(`/api/funding-offers/${offerId}/accept`)
      .set('Authorization', 'Bearer caller-token')
      .expect(201);
    expect(reviewFundingOffer).toHaveBeenCalledWith(
      offerId,
      applicant,
      'Accepted',
    );
  });
});
