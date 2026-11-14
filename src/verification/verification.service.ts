import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { authorize } from '../domain/authorization/authorization.js';
import { OrganizationEntity } from '../organizations/organization.entity.js';
import { OrganizationMembershipEntity } from '../organizations/organization-membership.entity.js';
import { OrganizationMembershipStatus } from '../organizations/organization-membership.entity.js';
import {
  ObjectStorageService,
  type PresignedObjectUrl,
} from '../infrastructure/object-storage/object-storage.service.js';
import {
  VerificationCaseEntity,
  VerificationStatus,
} from './verification-case.entity.js';
import { VerificationDocumentEntity } from './verification-document.entity.js';
import { VerificationReviewEntity } from './verification-review.entity.js';

export type VerificationUploadInput = {
  fileName: string;
  contentType: string;
  contentLength: number;
  checksumSha256: string;
};

export type VerificationDecision = 'NeedsInfo' | 'Verified' | 'Rejected';

@Injectable()
export class VerificationService {
  constructor(
    @InjectRepository(VerificationCaseEntity)
    private readonly cases: Repository<VerificationCaseEntity>,
    @InjectRepository(VerificationDocumentEntity)
    private readonly documents: Repository<VerificationDocumentEntity>,
    @InjectRepository(VerificationReviewEntity)
    private readonly reviews: Repository<VerificationReviewEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly organizations: Repository<OrganizationEntity>,
    @InjectRepository(OrganizationMembershipEntity)
    private readonly memberships: Repository<OrganizationMembershipEntity>,
    private readonly storage: ObjectStorageService,
  ) {}

  async createCase(
    actorUserId: string,
    organizationId: string,
  ): Promise<VerificationCaseEntity> {
    const organization = await this.organizations.findOneBy({
      id: organizationId,
    });
    if (!organization)
      throw new NotFoundException('Verification resource was not found');
    await this.assertAccess(actorUserId, organization, 'organization.manage');
    const existing = await this.cases.findOneBy({ organizationId });
    if (existing) return existing;
    return this.cases.save(
      this.cases.create({
        organizationId,
        status: VerificationStatus.NotStarted,
        createdByUserId: actorUserId,
        decidedByUserId: null,
        decisionReason: null,
        expiresAt: null,
        revokedAt: null,
      }),
    );
  }

  async createDocumentUpload(
    actorUserId: string,
    caseId: string,
    input: VerificationUploadInput,
  ): Promise<PresignedObjectUrl> {
    const verificationCase = await this.getAuthorizedCase(
      actorUserId,
      caseId,
      'organization.manage',
    );
    if (!this.isEditable(verificationCase.status)) {
      throw new ConflictException(
        'Verification evidence cannot be changed in this state',
      );
    }
    const fileName = input.fileName.trim();
    if (
      !fileName ||
      fileName.length > 255 ||
      fileName
        .split('')
        .some(
          (character) =>
            character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
        ) ||
      /[/\\]/.test(fileName)
    ) {
      throw new ConflictException('Document metadata is invalid');
    }
    const scope = this.documentScope(verificationCase);
    const upload = await this.storage.createUploadUrl({ scope, ...input });
    await this.documents.save(
      this.documents.create({
        verificationCaseId: caseId,
        objectKey: upload.key,
        fileName,
        contentType: input.contentType,
        contentLength: input.contentLength,
        checksumSha256: input.checksumSha256,
        uploadedByUserId: actorUserId,
      }),
    );
    return upload;
  }

  async submit(
    actorUserId: string,
    caseId: string,
  ): Promise<VerificationCaseEntity> {
    const verificationCase = await this.getAuthorizedCase(
      actorUserId,
      caseId,
      'organization.manage',
    );
    if (!this.isEditable(verificationCase.status)) {
      throw new ConflictException(
        'Verification case cannot be submitted in this state',
      );
    }
    if (!(await this.documents.existsBy({ verificationCaseId: caseId }))) {
      throw new ConflictException(
        'At least one verification document is required',
      );
    }
    verificationCase.status = VerificationStatus.Pending;
    verificationCase.decidedByUserId = null;
    verificationCase.decisionReason = null;
    verificationCase.expiresAt = null;
    return this.cases.save(verificationCase);
  }

  async decide(
    reviewerUserId: string,
    caseId: string,
    decision: VerificationDecision,
    reason: string,
    expiresAt?: Date,
  ): Promise<VerificationCaseEntity> {
    await this.getAuthorizedCase(reviewerUserId, caseId, 'evaluation.submit');
    const normalizedReason = reason.trim();
    if (!normalizedReason || normalizedReason.length > 4000) {
      throw new ConflictException('A review reason is required');
    }
    if (
      decision === VerificationStatus.Verified &&
      expiresAt &&
      expiresAt <= new Date()
    ) {
      throw new ConflictException('Verification expiry must be in the future');
    }
    if (decision !== VerificationStatus.Verified && expiresAt) {
      throw new ConflictException('Expiry can only be set for verified cases');
    }
    return this.cases.manager.transaction(async (manager) => {
      const caseRepository = manager.getRepository(VerificationCaseEntity);
      const reviewRepository = manager.getRepository(VerificationReviewEntity);
      const lockedCase = await caseRepository.findOne({
        where: { id: caseId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedCase || lockedCase.status !== VerificationStatus.Pending) {
        throw new ConflictException('Verification case is not awaiting review');
      }
      if (lockedCase.createdByUserId === reviewerUserId) {
        throw new ConflictException(
          'The submitter cannot review their own verification case',
        );
      }
      lockedCase.status = decision;
      lockedCase.decidedByUserId = reviewerUserId;
      lockedCase.decisionReason = normalizedReason;
      lockedCase.expiresAt = expiresAt ?? null;
      lockedCase.revokedAt = null;
      await reviewRepository.save(
        reviewRepository.create({
          verificationCaseId: caseId,
          reviewerUserId,
          decision,
          reason: normalizedReason,
        }),
      );
      return caseRepository.save(lockedCase);
    });
  }

  async revoke(
    actorUserId: string,
    caseId: string,
    reason: string,
  ): Promise<VerificationCaseEntity> {
    const verificationCase = await this.getAuthorizedCase(
      actorUserId,
      caseId,
      'organization.manage',
    );
    if (
      ![
        VerificationStatus.Verified,
        VerificationStatus.Pending,
        VerificationStatus.NeedsInfo,
      ].some((status) => status === verificationCase.status)
    ) {
      throw new ConflictException(
        'Verification case cannot be revoked in this state',
      );
    }
    const normalizedReason = reason.trim();
    if (!normalizedReason || normalizedReason.length > 4000) {
      throw new ConflictException('A revocation reason is required');
    }
    verificationCase.status = VerificationStatus.Revoked;
    verificationCase.revokedAt = new Date();
    verificationCase.decidedByUserId = actorUserId;
    verificationCase.decisionReason = normalizedReason;
    return this.cases.save(verificationCase);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async expireDue(now = new Date()): Promise<number> {
    const result = await this.cases
      .createQueryBuilder()
      .update(VerificationCaseEntity)
      .set({ status: VerificationStatus.Expired })
      .where('status = :verified', { verified: VerificationStatus.Verified })
      .andWhere('"expiresAt" IS NOT NULL AND "expiresAt" <= :now', { now })
      .execute();
    return result.affected ?? 0;
  }

  async getCase(
    actorUserId: string,
    caseId: string,
  ): Promise<VerificationCaseEntity> {
    return this.getAuthorizedCase(actorUserId, caseId, 'resource.read');
  }

  async createDocumentDownload(
    actorUserId: string,
    caseId: string,
    documentId: string,
  ): Promise<PresignedObjectUrl> {
    const verificationCase = await this.getAuthorizedCase(
      actorUserId,
      caseId,
      'resource.read',
    );
    const document = await this.documents.findOneBy({
      id: documentId,
      verificationCaseId: caseId,
    });
    if (!document)
      throw new NotFoundException('Verification resource was not found');
    return this.storage.createDownloadUrl({
      scope: this.documentScope(verificationCase),
      key: document.objectKey,
    });
  }

  private async getAuthorizedCase(
    actorUserId: string,
    caseId: string,
    action: 'organization.manage' | 'evaluation.submit' | 'resource.read',
  ): Promise<VerificationCaseEntity> {
    const verificationCase = await this.cases.findOneBy({ id: caseId });
    if (!verificationCase)
      throw new NotFoundException('Verification resource was not found');
    const organization = await this.organizations.findOneBy({
      id: verificationCase.organizationId,
    });
    if (!organization)
      throw new NotFoundException('Verification resource was not found');
    await this.assertAccess(
      actorUserId,
      organization,
      action,
      action === 'resource.read',
    );
    return verificationCase;
  }

  private async assertAccess(
    actorUserId: string,
    organization: OrganizationEntity,
    action: 'organization.manage' | 'evaluation.submit' | 'resource.read',
    privateRead = false,
  ): Promise<void> {
    const membership = await this.memberships.findOneBy({
      organizationId: organization.id,
      userId: actorUserId,
      status: OrganizationMembershipStatus.Active,
    });
    const decision = authorize({
      userId: actorUserId,
      action,
      actingOrganizationId: organization.id,
      membership: membership
        ? {
            organizationId: membership.organizationId,
            userId: membership.userId,
            role: membership.role,
            status: membership.status,
          }
        : undefined,
      resourceOwnerUserId: organization.ownerUserId,
      resourceOwnerOrganizationId: organization.id,
      resourceType: 'VerificationCase',
    });
    const privateReaderAllowed =
      organization.ownerUserId === actorUserId ||
      membership?.role === 'Owner' ||
      membership?.role === 'Admin' ||
      membership?.role === 'Evaluator';
    if (!decision.allowed || (privateRead && !privateReaderAllowed)) {
      throw new NotFoundException('Verification resource was not found');
    }
  }

  private isEditable(status: VerificationStatus): boolean {
    return (
      status === VerificationStatus.NotStarted ||
      status === VerificationStatus.NeedsInfo
    );
  }

  private documentScope(verificationCase: VerificationCaseEntity): string {
    return `verification/${verificationCase.organizationId}/${verificationCase.id}`;
  }
}
