import { createHash } from 'node:crypto';
import { ApplicationAttachmentScanProcessor } from './application-attachment-scan.processor.js';

describe('ApplicationAttachmentScanProcessor', () => {
  const id = '4e38df44-63d1-467a-90d4-bde6bce3e6db';
  const content = Buffer.from('attachment content');
  const job = { name: 'scan-application-attachment', data: { attachmentId: id }, attemptsMade: 0, opts: { attempts: 3 } };

  function fixture(result: 'clean' | 'infected' = 'clean') {
    const attachment = { id, uploadedByUserId: 'uploader', organizationId: null, storageKey: 'private/file', sizeBytes: String(content.length), checksumSha256: createHash('sha256').update(content).digest('hex'), status: 'Uploaded' };
    const attachments = { findOneBy: vi.fn().mockResolvedValue(attachment), update: vi.fn().mockResolvedValue({ affected: 1 }) };
    const storage = { getObjectStream: vi.fn(async () => (async function* () { yield content; })()) };
    const scanner = { scan: vi.fn(async (stream: AsyncIterable<Uint8Array>) => { for await (const _chunk of stream) { } return result; }) };
    return { attachment, attachments, storage, scanner, processor: new ApplicationAttachmentScanProcessor(attachments as never, storage as never, scanner as never) };
  }

  it('marks the exact scanned content clean', async () => {
    const { processor, attachments, storage } = fixture();
    await processor.process(job as never);
    expect(storage.getObjectStream).toHaveBeenCalledWith('private/file', 'applications/uploads/uploader/uploader');
    expect(attachments.update).toHaveBeenCalledWith({ id, status: 'Uploaded' }, { status: 'Clean' });
  });

  it('quarantines infected content and checksum mismatches', async () => {
    const infected = fixture('infected');
    await infected.processor.process(job as never);
    expect(infected.attachments.update).toHaveBeenCalledWith({ id, status: 'Uploaded' }, { status: 'Quarantined' });
    const mismatched = fixture();
    mismatched.attachment.checksumSha256 = '0'.repeat(64);
    await mismatched.processor.process(job as never);
    expect(mismatched.attachments.update).toHaveBeenCalledWith({ id, status: 'Uploaded' }, { status: 'Quarantined' });
  });

  it('leaves transient failures unapproved and quarantines after the last retry', async () => {
    const { processor, scanner, attachments } = fixture();
    scanner.scan.mockRejectedValue(new Error('scanner unavailable'));
    await expect(processor.process(job as never)).rejects.toThrow('scanner unavailable');
    expect(attachments.update).not.toHaveBeenCalled();
    await processor.onFailed({ ...job, attemptsMade: 2 } as never);
    expect(attachments.update).not.toHaveBeenCalled();
    await processor.onFailed({ ...job, attemptsMade: 3 } as never);
    expect(attachments.update).toHaveBeenCalledWith({ id, status: 'Uploaded' }, { status: 'Quarantined' });
  });
});
