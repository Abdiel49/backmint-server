import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditPersistenceModule } from '../audit/audit-persistence.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import {
  EvidenceAssetEntity,
  EvidenceSubmissionEntity,
  MilestoneEntity,
  MilestoneTermsVersionEntity,
} from './milestone.entity.js';
import { MilestoneReviewEntity } from './milestone-review.entity.js';
import { MilestoneReviewsController } from './milestone-reviews.controller.js';
import { MilestoneReviewsService } from './milestone-reviews.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MilestoneEntity,
      MilestoneTermsVersionEntity,
      EvidenceSubmissionEntity,
      EvidenceAssetEntity,
      MilestoneReviewEntity,
    ]),
    AuditPersistenceModule,
    IdentityModule,
  ],
  controllers: [MilestoneReviewsController],
  providers: [MilestoneReviewsService],
})
export class MilestoneReviewsModule {}
