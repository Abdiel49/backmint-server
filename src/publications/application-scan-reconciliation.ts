import { In, type EntityManager } from 'typeorm';
import { ApplicationAttachmentEntity } from './application-attachment.entity.js';
import { ApplicationAnswerEntity, ApplicationEntity } from './application.entity.js';

export async function reconcileApplicationScans(manager: EntityManager, applicationId: string): Promise<void> {
  const application = await manager.getRepository(ApplicationEntity).findOne({ where: { id: applicationId }, lock: { mode: 'pessimistic_write' } });
  if (!application || application.status !== 'PendingFileScan') return;
  const answers = await manager.getRepository(ApplicationAnswerEntity).find({ where: { applicationId } });
  const ids = answers.flatMap((answer) => Array.isArray(answer.attachmentIds) ? answer.attachmentIds : []);
  const attachments = ids.length ? await manager.getRepository(ApplicationAttachmentEntity).find({ where: { id: In(ids), applicationId } }) : [];
  const clean = new Set(attachments.filter((attachment) => attachment.status === 'Clean').map((attachment) => attachment.id));
  let ready = true;
  for (const answer of answers) {
    if (!Array.isArray(answer.attachmentIds)) { ready = false; continue; }
    if (!answer.attachmentIds.length) { if (answer.fileScanStatus !== 'NotRequired') ready = false; continue; }
    const passed = answer.attachmentIds.every((id) => clean.has(id.toLowerCase()));
    if (!passed) ready = false;
    if (passed && answer.fileScanStatus !== 'Passed')
      await manager.getRepository(ApplicationAnswerEntity).update({ id: answer.id, fileScanStatus: 'Pending' }, { fileScanStatus: 'Passed' });
  }
  if (ready && ids.length > 0)
    await manager.getRepository(ApplicationEntity).update({ id: applicationId, status: 'PendingFileScan' }, { status: 'Submitted' });
}
