import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { PublicationsModule } from './publications.module.js';
import { ApplicationLifecycleController } from './application-lifecycle.controller.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ObjectStorageModule } from '../infrastructure/object-storage/object-storage.module.js';
import { ApplicationAttachmentEntity } from './application-attachment.entity.js';
import { ApplicationAttachmentController } from './application-attachment.controller.js';
import { ApplicationAttachmentService } from './application-attachment.service.js';
import { ApplicationAttachmentScanProcessor } from './application-attachment-scan.processor.js';
import { AsyncQueuesModule } from '../infrastructure/async-queues/async-queues.module.js';
import { ClamAvScannerService } from '../verification/clamav-scanner.service.js';
import { ApplicationAttachmentScanScheduler } from './application-attachment-scan.scheduler.js';

@Module({
  imports: [IdentityModule, PublicationsModule, ObjectStorageModule, AsyncQueuesModule, TypeOrmModule.forFeature([ApplicationAttachmentEntity])],
  controllers: [ApplicationLifecycleController, ApplicationAttachmentController],
  providers: [ApplicationAttachmentService, ApplicationAttachmentScanProcessor, ApplicationAttachmentScanScheduler, ClamAvScannerService],
})
export class ApplicationLifecycleModule {}
