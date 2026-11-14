import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '../identity/identity.module.js';
import { ObjectStorageModule } from '../infrastructure/object-storage/object-storage.module.js';
import { OrganizationEntity } from '../organizations/organization.entity.js';
import { OrganizationMembershipEntity } from '../organizations/organization-membership.entity.js';
import { VerificationCaseEntity } from './verification-case.entity.js';
import { VerificationDocumentEntity } from './verification-document.entity.js';
import { VerificationReviewEntity } from './verification-review.entity.js';
import { VerificationService } from './verification.service.js';
import { VerificationController } from './verification.controller.js';

@Module({
  imports: [
    IdentityModule,
    TypeOrmModule.forFeature([
      VerificationCaseEntity,
      VerificationDocumentEntity,
      VerificationReviewEntity,
      OrganizationEntity,
      OrganizationMembershipEntity,
    ]),
    ObjectStorageModule,
  ],
  controllers: [VerificationController],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class VerificationModule {}
