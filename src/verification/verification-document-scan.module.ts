import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AsyncQueuesModule } from '../infrastructure/async-queues/async-queues.module.js';
import { ObjectStorageModule } from '../infrastructure/object-storage/object-storage.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { VerificationDocumentEntity } from './verification-document.entity.js';
import { ClamAvScannerService } from './clamav-scanner.service.js';
import { VerificationMalwareScanProcessor } from './verification-malware-scan.processor.js';
import { VerificationUploadCompletionController } from './verification-upload-completion.controller.js';
import { VerificationDocumentScanService } from './verification-document-scan.service.js';
import { VerificationModule } from './verification.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([VerificationDocumentEntity]),
    AsyncQueuesModule,
    ObjectStorageModule,
    IdentityModule,
    NotificationsModule,
    VerificationModule,
  ],
  controllers: [VerificationUploadCompletionController],
  providers: [
    ClamAvScannerService,
    VerificationDocumentScanService,
    VerificationMalwareScanProcessor,
  ],
})
export class VerificationDocumentScanModule {}
