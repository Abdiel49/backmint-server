import { ApplicationAttachmentScanScheduler } from './application-attachment-scan.scheduler.js';

describe('ApplicationAttachmentScanScheduler', () => {
  it('requeues uploaded attachments using stable job IDs', async () => {
    const attachments = { find: vi.fn().mockResolvedValue([{ id: 'attachment-id' }]) };
    const queues = { enqueue: vi.fn().mockResolvedValue('job') };
    const scheduler = new ApplicationAttachmentScanScheduler(attachments as never, queues as never);
    await scheduler.schedulePending();
    expect(attachments.find).toHaveBeenCalledWith({ where: { status: 'Uploaded' }, order: { createdAt: 'ASC', id: 'ASC' }, take: 100 });
    expect(queues.enqueue).toHaveBeenCalledWith('application-attachment-scans', 'scan-application-attachment', { attachmentId: 'attachment-id' }, { jobId: 'application-attachment-attachment-id' });
  });
});
