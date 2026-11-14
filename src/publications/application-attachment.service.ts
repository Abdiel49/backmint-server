import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { DataSource, IsNull } from 'typeorm';
import { malwareScanConfig } from '../config/configuration.js';
import { ObjectStorageService } from '../infrastructure/object-storage/object-storage.service.js';
import { OrganizationEntity } from '../organizations/organization.entity.js';
import { OrganizationMembershipEntity } from '../organizations/organization-membership.entity.js';
import { OrganizationRepresentativeEntity } from '../organizations/organization-representative.entity.js';
import { ApplicationAttachmentEntity } from './application-attachment.entity.js';

@Injectable()
export class ApplicationAttachmentService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: ObjectStorageService,
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
}
