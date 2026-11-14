import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditPersistenceModule } from '../audit/audit-persistence.module.js';
import { AsyncQueuesModule } from '../infrastructure/async-queues/async-queues.module.js';
import { ObjectStorageModule } from '../infrastructure/object-storage/object-storage.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ClamAvScannerService } from '../verification/clamav-scanner.service.js';
import {
  EvidenceAssetEntity,
  EvidenceSubmissionEntity,
  MilestoneEntity,
  MilestoneTermsVersionEntity,
} from './milestone.entity.js';
import { MilestoneReviewEntity } from './milestone-review.entity.js';
import { MilestoneReviewsController } from './milestone-reviews.controller.js';
import { MilestoneReviewsService } from './milestone-reviews.service.js';
import { MilestoneEvidenceController } from './milestone-evidence.controller.js';
import { MilestoneEvidenceService } from './milestone-evidence.service.js';
import { MilestoneEvidenceScanProcessor } from './milestone-evidence-scan.processor.js';

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
    AsyncQueuesModule,
    ObjectStorageModule,
    NotificationsModule,
  ],
  controllers: [MilestoneReviewsController, MilestoneEvidenceController],
  providers: [
    MilestoneReviewsService,
    MilestoneEvidenceService,
    ClamAvScannerService,
    MilestoneEvidenceScanProcessor,
  ],
})
export class MilestoneReviewsModule {}
