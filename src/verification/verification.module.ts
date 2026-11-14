import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ObjectStorageModule } from '../infrastructure/object-storage/object-storage.module.js';
import { OrganizationEntity } from '../organizations/organization.entity.js';
import { OrganizationMembershipEntity } from '../organizations/organization-membership.entity.js';
import { VerificationCaseEntity } from './verification-case.entity.js';
import { VerificationDocumentEntity } from './verification-document.entity.js';
import { VerificationReviewEntity } from './verification-review.entity.js';
import { VerificationService } from './verification.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VerificationCaseEntity,
      VerificationDocumentEntity,
      VerificationReviewEntity,
      OrganizationEntity,
      OrganizationMembershipEntity,
    ]),
    ObjectStorageModule,
  ],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class VerificationModule {}
