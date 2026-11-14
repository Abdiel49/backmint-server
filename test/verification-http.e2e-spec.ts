import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import request from 'supertest';
import { vi } from 'vitest';
import { AuthSessionService } from '../src/identity/auth-session.service.js';
import { VerificationController } from '../src/verification/verification.controller.js';
import { VerificationService } from '../src/verification/verification.service.js';

const caseRecord = {
  id: 'a7913c27-3479-4d99-916c-ff27a2c31a80',
  organizationId: 'd5f4c3b2-a190-4e87-9c6d-5b4a3f2e1d0c',
  status: 'NotStarted',
  stateVersion: 1,
  expiresAt: null,
  revokedAt: null,
  documents: [
    {
      id: '6aa74230-82f6-49c7-a756-ea974802aab3',
      objectKey: 'private/internal/key',
      fileName: 'registration-certificate.pdf',
      contentType: 'application/pdf',
      contentLength: 182440,
      checksumSha256: '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
      createdAt: new Date('2026-11-14T12:00:00.000Z'),
    },
  ],
};

describe('Verification HTTP (e2e)', () => {
  let app: INestApplication;
  const verificationService = {
    createCase: vi.fn(async () => caseRecord),
    getCase: vi.fn(async () => caseRecord),
    createDocumentUpload: vi.fn(async () => ({
      key: 'private/internal/key',
      url: 'https://storage.example.test/upload?signature=secret',
      expiresAt: new Date('2026-11-14T12:15:00.000Z'),
    })),
    submit: vi.fn(async () => ({
      ...caseRecord,
      status: 'Pending',
      documents: [],
    })),
    decide: vi.fn(async () => ({
      ...caseRecord,
      status: 'Verified',
      documents: [],
    })),
    revoke: vi.fn(async () => ({
      ...caseRecord,
      status: 'Revoked',
      documents: [],
    })),
    createDocumentDownload: vi.fn(async () => ({
      key: 'private/internal/key',
      url: 'https://storage.example.test/download?signature=secret',
      expiresAt: new Date('2026-11-14T12:15:00.000Z'),
    })),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [VerificationController],
      providers: [
        { provide: VerificationService, useValue: verificationService },
        {
          provide: AuthSessionService,
          useValue: {
            authenticate: vi.fn(async (token: string) =>
              token === 'valid-session'
                ? {
                    id: 'd9df9b34-0266-4e55-970d-fd774d8293e2',
                    userId: 'f2625a81-2af8-4c5b-943a-07c4763fce29',
                  }
                : null,
            ),
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => app.close());

  it('creates a case using the bearer session identity and returns no storage key', async () => {
    await request(app.getHttpServer())
      .post(
        '/api/organizations/d5f4c3b2-a190-4e87-9c6d-5b4a3f2e1d0c/verification',
      )
      .expect(401);

    const response = await request(app.getHttpServer())
      .post(
        '/api/organizations/d5f4c3b2-a190-4e87-9c6d-5b4a3f2e1d0c/verification',
      )
      .set('Authorization', 'Bearer valid-session')
      .expect(201);

    expect(verificationService.createCase).toHaveBeenCalledWith(
      'f2625a81-2af8-4c5b-943a-07c4763fce29',
      'd5f4c3b2-a190-4e87-9c6d-5b4a3f2e1d0c',
    );
    expect(response.body.documents[0]).not.toHaveProperty('objectKey');
  });

  it('validates upload metadata, applies upload URL flow and hides object keys', async () => {
    await request(app.getHttpServer())
      .post(
        '/api/verification-cases/a7913c27-3479-4d99-916c-ff27a2c31a80/documents/upload-url',
      )
      .set('Authorization', 'Bearer valid-session')
      .send({
        fileName: '../secret.pdf',
        contentType: 'application/pdf',
        contentLength: 100,
        checksumSha256: 'invalid',
      })
      .expect(400);

    const response = await request(app.getHttpServer())
      .post(
        '/api/verification-cases/a7913c27-3479-4d99-916c-ff27a2c31a80/documents/upload-url',
      )
      .set('Authorization', 'Bearer valid-session')
      .send({
        fileName: 'registration-certificate.pdf',
        contentType: 'application/pdf',
        contentLength: 182440,
        checksumSha256: '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
      })
      .expect(201);

    expect(response.body).not.toHaveProperty('key');
    expect(verificationService.createDocumentUpload).toHaveBeenCalledWith(
      'f2625a81-2af8-4c5b-943a-07c4763fce29',
      'a7913c27-3479-4d99-916c-ff27a2c31a80',
      expect.objectContaining({ fileName: 'registration-certificate.pdf' }),
    );
  });

  it('exposes submission, reviewer, revocation and private download routes', async () => {
    await request(app.getHttpServer())
      .post(
        '/api/verification-cases/a7913c27-3479-4d99-916c-ff27a2c31a80/submit',
      )
      .set('Authorization', 'Bearer valid-session')
      .expect(200);
    await request(app.getHttpServer())
      .post(
        '/api/verification-cases/a7913c27-3479-4d99-916c-ff27a2c31a80/reviews',
      )
      .set('Authorization', 'Bearer valid-session')
      .send({
        decision: 'Verified',
        reason: 'Registry details were checked.',
        expiresAt: '2027-11-14T12:00:00.000Z',
      })
      .expect(200);
    await request(app.getHttpServer())
      .post(
        '/api/verification-cases/a7913c27-3479-4d99-916c-ff27a2c31a80/revoke',
      )
      .set('Authorization', 'Bearer valid-session')
      .send({ reason: 'Evidence was replaced.' })
      .expect(200);
    const download = await request(app.getHttpServer())
      .post(
        '/api/verification-cases/a7913c27-3479-4d99-916c-ff27a2c31a80/documents/6aa74230-82f6-49c7-a756-ea974802aab3/download-url',
      )
      .set('Authorization', 'Bearer valid-session')
      .expect(200);
    expect(download.body).not.toHaveProperty('key');
  });

  it('rejects invalid decisions and normalizes private resource denial', async () => {
    await request(app.getHttpServer())
      .post(
        '/api/verification-cases/a7913c27-3479-4d99-916c-ff27a2c31a80/reviews',
      )
      .set('Authorization', 'Bearer valid-session')
      .send({ decision: 'Approved', reason: '' })
      .expect(400);

    verificationService.getCase.mockRejectedValueOnce(
      new NotFoundException('Verification resource was not found'),
    );
    await request(app.getHttpServer())
      .get('/api/verification-cases/a7913c27-3479-4d99-916c-ff27a2c31a80')
      .set('Authorization', 'Bearer valid-session')
      .expect(404);
  });

  it('documents realistic request examples in the generated OpenAPI document', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Verification API')
        .setVersion('1')
        .addBearerAuth()
        .build(),
    );
    const upload =
      document.paths['/api/verification-cases/{caseId}/documents/upload-url']
        ?.post;
    const review =
      document.paths['/api/verification-cases/{caseId}/reviews']?.post;
    expect(upload?.requestBody).toBeDefined();
    expect(review?.requestBody).toBeDefined();
    expect(
      document.paths['/api/verification-cases/{caseId}/submit']?.post,
    ).toBeDefined();
  });
});
