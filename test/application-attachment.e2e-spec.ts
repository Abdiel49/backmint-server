import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { malwareScanConfig } from '../src/config/configuration.js';
import { AuthSessionGuard } from '../src/identity/auth-session.guard.js';
import { AuthSessionService } from '../src/identity/auth-session.service.js';
import { ObjectStorageService } from '../src/infrastructure/object-storage/object-storage.service.js';
import { OrganizationEntity } from '../src/organizations/organization.entity.js';
import { OrganizationMembershipEntity } from '../src/organizations/organization-membership.entity.js';
import { ApplicationAttachmentController } from '../src/publications/application-attachment.controller.js';
import { ApplicationAttachmentEntity } from '../src/publications/application-attachment.entity.js';
import { ApplicationAttachmentService } from '../src/publications/application-attachment.service.js';

describe('Application attachment upload (e2e)', () => {
  let app: INestApplication;
  const organizationId = '7c6f2ef9-1918-45da-88f4-dfa0474bd9d5';
  const createUploadUrl = vi.fn();
  const save = vi.fn();
  const input = { organizationId, mimeType: 'application/pdf', sizeBytes: 524288, checksumSha256: 'a'.repeat(64) };

  beforeAll(async () => {
    createUploadUrl.mockResolvedValue({ key: 'applications/uploads/private/file', url: 'https://objects.example.test/upload', expiresAt: new Date('2027-01-15T18:00:00Z') });
    save.mockImplementation(async (value) => ({ ...value, id: '4e38df44-63d1-467a-90d4-bde6bce3e6db' }));
    const module = await Test.createTestingModule({
      controllers: [ApplicationAttachmentController],
      providers: [ApplicationAttachmentService, AuthSessionGuard,
        { provide: malwareScanConfig.KEY, useValue: { maxBytes: 1000000 } },
        { provide: ObjectStorageService, useValue: { createUploadUrl } },
        { provide: AuthSessionService, useValue: { authenticate: vi.fn(async (token: string) => token === 'owner' ? { userId: 'user-owner' } : token === 'other' ? { userId: 'user-other' } : null) } },
        { provide: DataSource, useValue: { getRepository: (entity: unknown) => {
          if (entity === OrganizationEntity) return { findOneBy: vi.fn().mockResolvedValue({ id: organizationId }) };
          if (entity === OrganizationMembershipEntity) return { findOneBy: vi.fn(async ({ userId }) => userId === 'user-owner' ? { role: 'Owner' } : null) };
          if (entity === ApplicationAttachmentEntity) return { create: (value: unknown) => value, save };
          return { findOneBy: vi.fn().mockResolvedValue(null) };
        } } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => { createUploadUrl.mockClear(); save.mockClear(); });

  it('requires a session and active organization authority', async () => {
    await request(app.getHttpServer()).post('/api/applications/attachments/uploads').send(input).expect(401);
    await request(app.getHttpServer()).post('/api/applications/attachments/uploads').set('Authorization', 'Bearer other').send(input).expect(403);
    expect(createUploadUrl).not.toHaveBeenCalled();
  });

  it('registers a private scoped upload for an authorized applicant', async () => {
    const response = await request(app.getHttpServer()).post('/api/applications/attachments/uploads').set('Authorization', 'Bearer owner').send(input).expect(201);
    expect(createUploadUrl).toHaveBeenCalledWith({ scope: `applications/uploads/${organizationId}/user-owner`, contentType: 'application/pdf', contentLength: 524288, checksumSha256: Buffer.from(input.checksumSha256, 'hex').toString('base64') });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ uploadedByUserId: 'user-owner', organizationId, status: 'PendingUpload', checksumSha256: input.checksumSha256 }));
    expect(response.body).toMatchObject({ attachmentId: '4e38df44-63d1-467a-90d4-bde6bce3e6db', status: 'PendingUpload', requiredHeaders: { 'content-type': 'application/pdf' } });
    expect(response.body.storageKey).toBeUndefined();
  });

  it('rejects invalid metadata and configured size overflows before signing', async () => {
    await request(app.getHttpServer()).post('/api/applications/attachments/uploads').set('Authorization', 'Bearer owner').send({ ...input, checksumSha256: 'invalid' }).expect(400);
    await request(app.getHttpServer()).post('/api/applications/attachments/uploads').set('Authorization', 'Bearer owner').send({ ...input, sizeBytes: 1000001 }).expect(400);
    expect(createUploadUrl).not.toHaveBeenCalled();
  });
});
