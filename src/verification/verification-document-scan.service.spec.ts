import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { VerificationStatus } from './verification-case.entity.js';
import { VerificationDocumentScanStatus } from './verification-document.entity.js';
import { VerificationDocumentScanService } from './verification-document-scan.service.js';

function createHarness() {
  const document = {
    id: 'document-1',
    verificationCaseId: 'case-1',
    objectKey: 'verification/org-1/case-1/document-1',
    contentLength: 2048,
    checksumSha256: 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=',
    scanStatus: VerificationDocumentScanStatus.PendingUpload,
    scanFailure: null,
    uploadedAt: null,
  };
  const documents = {
    findOneBy: vi.fn(async () => document),
    findBy: vi.fn(async () => []),
    save: vi.fn(async (value) => value),
  };
  const verification = {
    getCaseForManagement: vi.fn(async () => ({
      id: 'case-1',
      organizationId: 'org-1',
      status: VerificationStatus.NotStarted,
    })),
  };
  const storage = {
    headObject: vi.fn(async () => ({
      contentLength: 2048,
      checksumSha256: document.checksumSha256,
      metadataChecksumSha256: document.checksumSha256,
    })),
  };
  const queues = { enqueue: vi.fn(async () => 'job-1') };
  const service = new VerificationDocumentScanService(
    documents as never,
    verification as never,
    storage as never,
    queues as never,
  );
  return { service, document, documents, verification, storage, queues };
}

describe('VerificationDocumentScanService', () => {
  it('validates object length and both checksum representations before enqueueing', async () => {
    const harness = createHarness();
    await expect(
      harness.service.completeUpload('owner-1', 'case-1', 'document-1'),
    ).resolves.toMatchObject({
      scanStatus: VerificationDocumentScanStatus.Queued,
    });
    expect(harness.queues.enqueue).toHaveBeenCalledWith(
      'malware-scans',
      'scan-verification-document',
      { documentId: 'document-1', caseId: 'case-1' },
      { jobId: 'verification-document-document-1' },
    );

    harness.storage.headObject.mockResolvedValueOnce({
      contentLength: 2047,
      checksumSha256: 'mismatch',
      metadataChecksumSha256: 'mismatch',
    });
    harness.document.scanStatus = VerificationDocumentScanStatus.PendingUpload;
    await expect(
      harness.service.completeUpload('owner-1', 'case-1', 'document-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('leaves uploads pending and private when the scan queue is unavailable', async () => {
    const harness = createHarness();
    harness.queues.enqueue.mockRejectedValueOnce(
      new Error('Redis unavailable'),
    );
    await expect(
      harness.service.completeUpload('owner-1', 'case-1', 'document-1'),
    ).rejects.toThrow('will be retried');
    expect(harness.document.scanStatus).toBe(
      VerificationDocumentScanStatus.Queued,
    );
    expect(harness.document.scanFailure).toBe('ScanQueueUnavailable');
  });
});
