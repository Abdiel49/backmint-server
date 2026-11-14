import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import dataSource from '../src/database/data-source.js';
import { malwareScanConfig } from '../src/config/configuration.js';
import { AuthSessionGuard } from '../src/identity/auth-session.guard.js';
import { AuthSessionService } from '../src/identity/auth-session.service.js';
import { UserEntity } from '../src/identity/user.entity.js';
import { IdentityProviderEntity } from '../src/identity/identity-provider.entity.js';
import { AsyncQueuesService } from '../src/infrastructure/async-queues/async-queues.service.js';
import { ObjectStorageService } from '../src/infrastructure/object-storage/object-storage.service.js';
import { OrganizationEntity } from '../src/organizations/organization.entity.js';
import { OrganizationMembershipEntity } from '../src/organizations/organization-membership.entity.js';
import { ApplicationAttachmentController } from '../src/publications/application-attachment.controller.js';
import { ApplicationAttachmentEntity } from '../src/publications/application-attachment.entity.js';
import { ApplicationAttachmentService } from '../src/publications/application-attachment.service.js';
import { ApplicationAnswerEntity, ApplicationEntity } from '../src/publications/application.entity.js';
import { ProjectEntity } from '../src/publications/project.entity.js';
import { CallEntity } from '../src/publications/call.entity.js';
import { EvaluationAssignmentEntity, EvaluationRoundEntity } from '../src/evaluations/evaluation.entity.js';

describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== 'true')('Application reviewer attachment download', () => {
  let connection: DataSource;
  let app: INestApplication;
  const users = { owner: randomUUID(), reviewer: randomUUID(), conflicted: randomUUID(), unrelated: randomUUID(), closedReviewer: randomUUID() };
  const ids = { organization: randomUUID(), project: randomUUID(), application: randomUUID(), round: randomUUID(), clean: randomUUID(), pending: randomUUID(), quarantined: randomUUID() };
  const sign = vi.fn(async () => ({ url: 'https://objects.example.test/private?signature=example', expiresAt: new Date('2027-01-15T18:00:00Z') }));
  const path = (attachment: string) => `/api/applications/attachments/${ids.application}/${attachment}/download`;

  beforeAll(async () => {
    connection = new DataSource({ ...dataSource.options, entities: [UserEntity, IdentityProviderEntity, OrganizationEntity, OrganizationMembershipEntity, ProjectEntity, CallEntity, ApplicationEntity, ApplicationAnswerEntity, ApplicationAttachmentEntity, EvaluationAssignmentEntity, EvaluationRoundEntity], migrations: [] });
    await connection.initialize();
    for (const [name, id] of Object.entries(users)) await connection.query('INSERT INTO "users" ("id", "displayName") VALUES ($1, $2)', [id, name]);
    await connection.query(`INSERT INTO "organizations" ("id", "slug", "name", "organizationType", "country", "legalStatus", "ownerUserId") VALUES ($1, $2, 'Funder', 'Nonprofit', 'BO', 'Incorporated', $3)`, [ids.organization, `download-${randomUUID()}`, users.owner]);
    for (const user of [users.reviewer, users.conflicted, users.closedReviewer]) await connection.query(`INSERT INTO "organization_memberships" ("organizationId", "userId", "role", "status", "invitedByUserId", "acceptedAt") VALUES ($1, $2, 'Evaluator', 'Active', $3, now())`, [ids.organization, user, users.owner]);
    await connection.query(`INSERT INTO "projects" ("id", "ownerOrganizationId", "title", "description", "direction", "lifecycleStatus", "content") VALUES ($1, $2, 'Grant', 'Funding', 'FundingOffered', 'Published', '{}')`, [ids.project, ids.organization]);
    await connection.query(`INSERT INTO "applications" ("id", "sourceType", "sourceId", "applicantUserId", "applicantKey", "sourceVersion", "sourceSnapshot", "applicantSnapshot", "proposalSnapshot", "status", "receipt") VALUES ($1, 'Project', $2, $3, $4, 1, '{}', '{}', '{}', 'Submitted', $5)`, [ids.application, ids.project, users.owner, users.owner, randomUUID()]);
    for (const [index, entry] of [ids.clean, ids.pending, ids.quarantined].entries()) {
      const status = ['Clean', 'Uploaded', 'Quarantined'][index];
      await connection.query(`INSERT INTO "application_attachments" ("id", "uploadedByUserId", "applicationId", "storageKey", "mimeType", "sizeBytes", "checksumSha256", "status") VALUES ($1, $2, $3, $4, 'application/pdf', 100, $5, $6)`, [entry, users.owner, ids.application, `applications/uploads/${users.owner}/${users.owner}/${entry}`, 'a'.repeat(64), status]);
      await connection.query(`INSERT INTO "application_answers" ("applicationId", "questionKey", "answer", "attachmentIds", "fileScanStatus") VALUES ($1, $2, $3, $4, $5)`, [ids.application, `question-${index}`, JSON.stringify('Plan'), JSON.stringify([entry]), index === 0 ? 'Passed' : 'Pending']);
    }
    await connection.query(`INSERT INTO "evaluation_rounds" ("id", "sourceType", "sourceId", "stage", "rubricVersion", "rubric", "status", "createdByUserId") VALUES ($1, 'Project', $2, 'Review', 1, '{}', 'Open', $3)`, [ids.round, ids.project, users.owner]);
    await connection.query(`INSERT INTO "evaluation_assignments" ("roundId", "evaluatorUserId", "applicationId", "conflictStatus", "conflictDeclaredAt", "status") VALUES ($1, $2, $3, 'NoConflict', now(), 'InProgress')`, [ids.round, users.reviewer, ids.application]);
    await connection.query(`INSERT INTO "evaluation_assignments" ("roundId", "evaluatorUserId", "applicationId", "conflictStatus", "conflictReason", "conflictDeclaredAt", "status") VALUES ($1, $2, $3, 'Declared', 'Conflict', now(), 'Conflicted')`, [ids.round, users.conflicted, ids.application]);
    const closedRound = randomUUID();
    await connection.query(`INSERT INTO "evaluation_rounds" ("id", "sourceType", "sourceId", "stage", "rubricVersion", "rubric", "status", "createdByUserId") VALUES ($1, 'Project', $2, 'Final', 1, '{}', 'Closed', $3)`, [closedRound, ids.project, users.owner]);
    await connection.query(`INSERT INTO "evaluation_assignments" ("roundId", "evaluatorUserId", "applicationId", "conflictStatus", "conflictDeclaredAt", "status") VALUES ($1, $2, $3, 'NoConflict', now(), 'InProgress')`, [closedRound, users.closedReviewer, ids.application]);
    const module = await Test.createTestingModule({ controllers: [ApplicationAttachmentController], providers: [ApplicationAttachmentService, AuthSessionGuard, { provide: DataSource, useValue: connection }, { provide: malwareScanConfig.KEY, useValue: { maxBytes: 1000000 } }, { provide: ObjectStorageService, useValue: { createDownloadUrl: sign } }, { provide: AsyncQueuesService, useValue: {} }, { provide: AuthSessionService, useValue: { authenticate: async (token: string) => token in users ? { userId: users[token as keyof typeof users] } : null } }] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => { await app?.close(); if (connection?.isInitialized) await connection.destroy(); });
  beforeEach(() => sign.mockClear());

  it('signs only the assigned reviewer’s clean linked attachment', async () => {
    const response = await request(app.getHttpServer()).get(path(ids.clean)).set('Authorization', 'Bearer reviewer').expect(200);
    expect(response.body).toMatchObject({ attachmentId: ids.clean, url: 'https://objects.example.test/private?signature=example' });
    expect(sign).toHaveBeenCalledWith({ scope: `applications/uploads/${users.owner}/${users.owner}`, key: `applications/uploads/${users.owner}/${users.owner}/${ids.clean}` });
  });

  it('hides pending and quarantined files, conflicts and unrelated assignments', async () => {
    await request(app.getHttpServer()).get(path(ids.clean)).expect(401);
    await request(app.getHttpServer()).get(path(ids.clean)).set('Authorization', 'Bearer unrelated').expect(404);
    await request(app.getHttpServer()).get(path(ids.clean)).set('Authorization', 'Bearer conflicted').expect(404);
    await request(app.getHttpServer()).get(path(ids.pending)).set('Authorization', 'Bearer reviewer').expect(404);
    await request(app.getHttpServer()).get(path(ids.quarantined)).set('Authorization', 'Bearer reviewer').expect(404);
    await request(app.getHttpServer()).get(`/api/applications/attachments/${randomUUID()}/${ids.clean}/download`).set('Authorization', 'Bearer reviewer').expect(404);
    expect(sign).not.toHaveBeenCalled();
  });

  it('denies a reviewer whose membership or round is no longer active', async () => {
    await connection.query(`UPDATE "organization_memberships" SET "status" = 'Suspended' WHERE "organizationId" = $1 AND "userId" = $2`, [ids.organization, users.reviewer]);
    await request(app.getHttpServer()).get(path(ids.clean)).set('Authorization', 'Bearer reviewer').expect(404);
    await request(app.getHttpServer()).get(path(ids.clean)).set('Authorization', 'Bearer closedReviewer').expect(404);
    expect(sign).not.toHaveBeenCalled();
  });
});
