import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { malwareScanConfig } from '../src/config/configuration.js';
import { AuthSessionGuard } from '../src/identity/auth-session.guard.js';
import { AuthSessionService } from '../src/identity/auth-session.service.js';
import { ObjectStorageService } from '../src/infrastructure/object-storage/object-storage.service.js';
import { AsyncQueuesService } from '../src/infrastructure/async-queues/async-queues.service.js';
import { OrganizationEntity } from '../src/organizations/organization.entity.js';
import { OrganizationMembershipEntity } from '../src/organizations/organization-membership.entity.js';
import { ApplicationAttachmentController } from '../src/publications/application-attachment.controller.js';
import { ApplicationAttachmentEntity } from '../src/publications/application-attachment.entity.js';
import { ApplicationAttachmentService } from '../src/publications/application-attachment.service.js';

describe('Application attachment upload (e2e)', () => {
  let app: INestApplication;
  const organizationId = '7c6f2ef9-1918-45da-88f4-dfa0474bd9d5';
  const createUploadUrl = vi.fn();
  const headObject = vi.fn();
  const findAttachment = vi.fn();
  const save = vi.fn();
  const enqueue = vi.fn();
  const input = { organizationId, mimeType: 'application/pdf', sizeBytes: 524288, checksumSha256: 'a'.repeat(64) };

  beforeAll(async () => {
    createUploadUrl.mockResolvedValue({ key: 'applications/uploads/private/file', url: 'https://objects.example.test/upload', expiresAt: new Date('2027-01-15T18:00:00Z') });
    save.mockImplementation(async (value) => ({ ...value, id: '4e38df44-63d1-467a-90d4-bde6bce3e6db' }));
    enqueue.mockResolvedValue('job');
    const getRepository = (entity: unknown) => {
      if (entity === OrganizationEntity) return { findOneBy: vi.fn().mockResolvedValue({ id: organizationId }) };
      if (entity === OrganizationMembershipEntity) return { findOneBy: vi.fn(async ({ userId }) => userId === 'user-owner' ? { role: 'Owner' } : null) };
      if (entity === ApplicationAttachmentEntity) return { create: (value: unknown) => value, findOne: findAttachment, save };
      return { findOneBy: vi.fn().mockResolvedValue(null) };
    };
    const module = await Test.createTestingModule({
      controllers: [ApplicationAttachmentController],
      providers: [ApplicationAttachmentService, AuthSessionGuard,
        { provide: malwareScanConfig.KEY, useValue: { maxBytes: 1000000 } },
        { provide: ObjectStorageService, useValue: { createUploadUrl, headObject } },
        { provide: AsyncQueuesService, useValue: { enqueue } },
        { provide: AuthSessionService, useValue: { authenticate: vi.fn(async (token: string) => token === 'owner' ? { userId: 'user-owner' } : token === 'other' ? { userId: 'user-other' } : null) } },
        { provide: DataSource, useValue: { transaction: (callback: (manager: unknown) => unknown) => callback({ getRepository }), getRepository } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => { createUploadUrl.mockClear(); save.mockClear(); enqueue.mockClear(); headObject.mockReset(); findAttachment.mockReset(); });

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

  it('confirms matching uploaded metadata and keeps the file pending scanning', async () => {
    const id = '4e38df44-63d1-467a-90d4-bde6bce3e6db';
    findAttachment.mockResolvedValue({ id, uploadedByUserId: 'user-owner', organizationId, storageKey: 'private/file', sizeBytes: '524288', checksumSha256: input.checksumSha256, status: 'PendingUpload' });
    const checksum = Buffer.from(input.checksumSha256, 'hex').toString('base64');
    headObject.mockResolvedValue({ contentLength: 524288, checksumSha256: checksum, metadataChecksumSha256: checksum });
    const response = await request(app.getHttpServer()).post(`/api/applications/attachments/${id}/complete`).set('Authorization', 'Bearer owner').expect(200);
    expect(response.body).toEqual({ attachmentId: id, status: 'Uploaded' });
    expect(headObject).toHaveBeenCalledWith('private/file', `applications/uploads/${organizationId}/user-owner`);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ status: 'Uploaded' }));
    expect(enqueue).toHaveBeenCalledWith('application-attachment-scans', 'scan-application-attachment', { attachmentId: id }, { jobId: `application-attachment-${id}` });
  });

  it('rejects missing, mismatched and unauthorized uploads without changing status', async () => {
    const id = '4e38df44-63d1-467a-90d4-bde6bce3e6db';
    const attachment = { id, uploadedByUserId: 'user-owner', organizationId, storageKey: 'private/file', sizeBytes: '524288', checksumSha256: input.checksumSha256, status: 'PendingUpload' };
    await request(app.getHttpServer()).post(`/api/applications/attachments/${id}/complete`).set('Authorization', 'Bearer other').expect(404);
    findAttachment.mockResolvedValue(attachment);
    headObject.mockRejectedValueOnce({ name: 'NotFound' });
    await request(app.getHttpServer()).post(`/api/applications/attachments/${id}/complete`).set('Authorization', 'Bearer owner').expect(409);
    headObject.mockResolvedValue({ contentLength: 1, checksumSha256: 'wrong', metadataChecksumSha256: 'wrong' });
    await request(app.getHttpServer()).post(`/api/applications/attachments/${id}/complete`).set('Authorization', 'Bearer owner').expect(409);
    const checksum = Buffer.from(input.checksumSha256, 'hex').toString('base64');
    headObject.mockResolvedValue({ contentLength: 524288, checksumSha256: 'wrong', metadataChecksumSha256: checksum });
    await request(app.getHttpServer()).post(`/api/applications/attachments/${id}/complete`).set('Authorization', 'Bearer owner').expect(409);
    headObject.mockResolvedValue({ contentLength: 1, checksumSha256: checksum, metadataChecksumSha256: checksum });
    await request(app.getHttpServer()).post(`/api/applications/attachments/${id}/complete`).set('Authorization', 'Bearer owner').expect(409);
    expect(save).not.toHaveBeenCalled();
  });

  it('requeues an existing confirmation on retry without querying storage', async () => {
    const id = '4e38df44-63d1-467a-90d4-bde6bce3e6db';
    findAttachment.mockResolvedValue({ id, uploadedByUserId: 'user-owner', organizationId: null, status: 'Uploaded' });
    const response = await request(app.getHttpServer()).post(`/api/applications/attachments/${id}/complete`).set('Authorization', 'Bearer owner').expect(200);
    expect(response.body).toEqual({ attachmentId: id, status: 'Uploaded' });
    expect(headObject).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledOnce();
  });

  it('returns 503 when the scan cannot be queued and permits a later retry', async () => {
    const id = '4e38df44-63d1-467a-90d4-bde6bce3e6db';
    findAttachment.mockResolvedValue({ id, uploadedByUserId: 'user-owner', organizationId: null, status: 'Uploaded' });
    enqueue.mockRejectedValueOnce(new Error('queue unavailable'));
    await request(app.getHttpServer()).post(`/api/applications/attachments/${id}/complete`).set('Authorization', 'Bearer owner').expect(503);
    await request(app.getHttpServer()).post(`/api/applications/attachments/${id}/complete`).set('Authorization', 'Bearer owner').expect(200);
    expect(enqueue).toHaveBeenCalledTimes(2);
  });
});
