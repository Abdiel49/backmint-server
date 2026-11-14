import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { DataSource, IsNull } from 'typeorm';
import { malwareScanConfig } from '../config/configuration.js';
import { ObjectStorageService } from '../infrastructure/object-storage/object-storage.service.js';
import { AsyncQueueName } from '../infrastructure/async-queues/async-queues.constants.js';
import { AsyncQueuesService } from '../infrastructure/async-queues/async-queues.service.js';
import { OrganizationEntity } from '../organizations/organization.entity.js';
import { OrganizationMembershipEntity } from '../organizations/organization-membership.entity.js';
import { OrganizationRepresentativeEntity } from '../organizations/organization-representative.entity.js';
import { ApplicationAttachmentEntity } from './application-attachment.entity.js';

@Injectable()
export class ApplicationAttachmentService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: ObjectStorageService,
    private readonly queues: AsyncQueuesService,
    @Inject(malwareScanConfig.KEY) private readonly scanConfig: ConfigType<typeof malwareScanConfig>,
  ) {}

  async createUpload(actorUserId: string, input: { organizationId?: string; mimeType: string; sizeBytes: number; checksumSha256: string }) {
    if (input.sizeBytes > this.scanConfig.maxBytes) throw new BadRequestException('Attachment exceeds the configured scan size limit');
    if (input.organizationId) {
      const organization = await this.dataSource.getRepository(OrganizationEntity).findOneBy({ id: input.organizationId, status: 'Active' });
      const membership = await this.dataSource.getRepository(OrganizationMembershipEntity).findOneBy({ organizationId: input.organizationId, userId: actorUserId, status: 'Active' });
      let permitted = Boolean(organization && membership && ['Owner', 'Admin', 'ProjectManager'].includes(membership.role));
      if (organization && membership?.role === 'Representative') {
        const authority = await this.dataSource.getRepository(OrganizationRepresentativeEntity).findOneBy({ organizationId: input.organizationId, userId: actorUserId, revokedAt: IsNull() });
        permitted = Boolean(authority && authority.verifiedAt <= new Date() && authority.expiresAt > new Date());
      }
      if (!permitted) throw new ForbiddenException('Active applicant organization authority is required');
    }
    const scope = `applications/uploads/${input.organizationId ?? actorUserId}/${actorUserId}`;
    const checksumBase64 = Buffer.from(input.checksumSha256, 'hex').toString('base64');
    const signed = await this.storage.createUploadUrl({ scope, contentType: input.mimeType, contentLength: input.sizeBytes, checksumSha256: checksumBase64 });
    const repository = this.dataSource.getRepository(ApplicationAttachmentEntity);
    const attachment = await repository.save(repository.create({ uploadedByUserId: actorUserId, organizationId: input.organizationId ?? null, storageKey: signed.key, mimeType: input.mimeType, sizeBytes: String(input.sizeBytes), checksumSha256: input.checksumSha256, status: 'PendingUpload' }));
    return { attachmentId: attachment.id, status: attachment.status, uploadUrl: signed.url, expiresAt: signed.expiresAt, requiredHeaders: { 'content-type': input.mimeType, 'x-amz-checksum-sha256': checksumBase64 } };
  }

  async completeUpload(actorUserId: string, attachmentId: string) {
    const result = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ApplicationAttachmentEntity);
      const attachment = await repository.findOne({ where: { id: attachmentId, uploadedByUserId: actorUserId }, lock: { mode: 'pessimistic_write' } });
      if (!attachment) throw new NotFoundException('Application attachment was not found');
      if (attachment.organizationId) {
        const organization = await manager.getRepository(OrganizationEntity).findOneBy({ id: attachment.organizationId, status: 'Active' });
        const membership = await manager.getRepository(OrganizationMembershipEntity).findOneBy({ organizationId: attachment.organizationId, userId: actorUserId, status: 'Active' });
        let permitted = Boolean(organization && membership && ['Owner', 'Admin', 'ProjectManager'].includes(membership.role));
        if (organization && membership?.role === 'Representative') {
          const authority = await manager.getRepository(OrganizationRepresentativeEntity).findOneBy({ organizationId: attachment.organizationId, userId: actorUserId, revokedAt: IsNull() });
          permitted = Boolean(authority && authority.verifiedAt <= new Date() && authority.expiresAt > new Date());
        }
        if (!permitted) throw new ForbiddenException('Active applicant organization authority is required');
      }
      if (['Uploaded', 'Clean', 'Quarantined'].includes(attachment.status)) return { attachmentId: attachment.id, status: attachment.status };
      if (attachment.status !== 'PendingUpload') throw new ConflictException('Application attachment is not awaiting upload');
      const scope = `applications/uploads/${attachment.organizationId ?? attachment.uploadedByUserId}/${attachment.uploadedByUserId}`;
      let stored;
      try {
        stored = await this.storage.headObject(attachment.storageKey, scope);
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        const name = (error as { name?: string }).name;
        if (status === 404 || name === 'NotFound' || name === 'NoSuchKey') throw new ConflictException('Uploaded application attachment was not found');
        throw new ServiceUnavailableException('Private object storage is unavailable for upload verification');
      }
      const checksum = Buffer.from(attachment.checksumSha256, 'hex').toString('base64');
      if (stored.contentLength !== Number(attachment.sizeBytes) || stored.checksumSha256 !== checksum || stored.metadataChecksumSha256 !== checksum)
        throw new ConflictException('Uploaded application attachment does not match its declared size and SHA-256 checksum');
      attachment.status = 'Uploaded';
      await repository.save(attachment);
      return { attachmentId: attachment.id, status: attachment.status };
    });
    if (result.status === 'Uploaded') {
      try {
        await this.queues.enqueue(AsyncQueueName.ApplicationAttachmentScans, 'scan-application-attachment', { attachmentId: result.attachmentId }, { jobId: `application-attachment-${result.attachmentId}` });
      } catch {
        throw new ServiceUnavailableException('Attachment malware scan could not be queued; retry upload completion');
      }
    }
    return result;
  }
}
