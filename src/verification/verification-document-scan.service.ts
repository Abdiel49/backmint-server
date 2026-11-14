import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { AsyncQueueName } from '../infrastructure/async-queues/async-queues.constants.js';
import { AsyncQueuesService } from '../infrastructure/async-queues/async-queues.service.js';
import { ObjectStorageService } from '../infrastructure/object-storage/object-storage.service.js';
import { VerificationService } from './verification.service.js';
import { VerificationStatus } from './verification-case.entity.js';
import {
  VerificationDocumentEntity,
  VerificationDocumentScanStatus,
} from './verification-document.entity.js';

@Injectable()
export class VerificationDocumentScanService {
  constructor(
    @InjectRepository(VerificationDocumentEntity)
    private readonly documents: Repository<VerificationDocumentEntity>,
    private readonly verification: VerificationService,
    private readonly storage: ObjectStorageService,
    private readonly queues: AsyncQueuesService,
  ) {}

  async completeUpload(
    actorUserId: string,
    caseId: string,
    documentId: string,
  ) {
    const verificationCase = await this.verification.getCaseForManagement(
      actorUserId,
      caseId,
    );
    if (
      !new Set<string>([
        VerificationStatus.NotStarted,
        VerificationStatus.NeedsInfo,
      ]).has(verificationCase.status)
    ) {
      throw new ConflictException(
        'Verification evidence cannot be changed in this state',
      );
    }
    const document = await this.documents.findOneBy({
      id: documentId,
      verificationCaseId: caseId,
    });
    if (!document)
      throw new NotFoundException('Verification resource was not found');
    if (document.scanStatus !== VerificationDocumentScanStatus.PendingUpload) {
      if (
        new Set<VerificationDocumentScanStatus>([
          VerificationDocumentScanStatus.Queued,
          VerificationDocumentScanStatus.Scanning,
          VerificationDocumentScanStatus.Passed,
        ]).has(document.scanStatus)
      ) {
        return { documentId, scanStatus: document.scanStatus };
      }
      throw new ConflictException(
        'Verification document is not awaiting upload completion',
      );
    }
    const scope = `verification/${verificationCase.organizationId}/${verificationCase.id}`;
    let stored;
    try {
      stored = await this.storage.headObject(document.objectKey, scope);
    } catch (error) {
      const statusCode = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      const errorName = (error as { name?: string }).name;
      if (
        statusCode === 404 ||
        errorName === 'NotFound' ||
        errorName === 'NoSuchKey'
      ) {
        throw new ConflictException(
          'Uploaded verification object could not be found',
        );
      }
      throw new ServiceUnavailableException(
        'Private object storage is unavailable for upload verification',
      );
    }
    if (
      stored.contentLength !== document.contentLength ||
      stored.metadataChecksumSha256 !== document.checksumSha256 ||
      stored.checksumSha256 !== document.checksumSha256
    ) {
      throw new ConflictException(
        'Uploaded verification object does not match its declared length and SHA-256 checksum',
      );
    }
    document.scanStatus = VerificationDocumentScanStatus.Queued;
    document.uploadedAt = new Date();
    await this.documents.save(document);
    try {
      await this.enqueue(document);
    } catch {
      document.scanFailure = 'ScanQueueUnavailable';
      await this.documents.save(document);
      throw new ServiceUnavailableException(
        'Malware scan could not be scheduled; the private document will be retried',
      );
    }
    return { documentId, scanStatus: document.scanStatus };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async enqueuePendingScans(): Promise<number> {
    const documents = await this.documents.findBy({
      scanStatus: VerificationDocumentScanStatus.Queued,
    });
    let enqueued = 0;
    for (const document of documents) {
      try {
        await this.enqueue(document);
        enqueued += 1;
      } catch {
        continue;
      }
    }
    return enqueued;
  }

  private async enqueue(document: VerificationDocumentEntity): Promise<void> {
    await this.queues.enqueue(
      AsyncQueueName.MalwareScans,
      'scan-verification-document',
      { documentId: document.id, caseId: document.verificationCaseId },
      { jobId: `verification-document-${document.id}` },
    );
  }
}
