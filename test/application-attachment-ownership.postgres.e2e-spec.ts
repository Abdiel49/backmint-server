import { DataSource } from 'typeorm';
import dataSource from '../src/database/data-source.js';
import { UserEntity } from '../src/identity/user.entity.js';
import { IdentityProviderEntity } from '../src/identity/identity-provider.entity.js';
import { OrganizationEntity } from '../src/organizations/organization.entity.js';
import { ApplicationAttachmentEntity } from '../src/publications/application-attachment.entity.js';
import { ApplicationAnswerEntity, ApplicationEntity } from '../src/publications/application.entity.js';
import { ProjectEntity, ProjectVersionEntity } from '../src/publications/project.entity.js';
import { ParticipationService } from '../src/publications/participation.service.js';
import { FundingDirection, PublicationSourceType } from '../src/publications/publication.types.js';

describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== 'true')('Application attachment ownership PostgreSQL', () => {
  let connection: DataSource;
  let service: ParticipationService;

  beforeAll(async () => {
    connection = new DataSource({ ...dataSource.options, entities: [UserEntity, IdentityProviderEntity, OrganizationEntity, ProjectEntity, ProjectVersionEntity, ApplicationEntity, ApplicationAnswerEntity, ApplicationAttachmentEntity], migrations: [] });
    await connection.initialize();
    service = new ParticipationService(connection);
  });
  afterAll(async () => { if (connection?.isInitialized) await connection.destroy(); });

  it('links an owned attachment once and rejects foreign, missing, and repeated IDs atomically', async () => {
    const users = await connection.getRepository(UserEntity).save([{ displayName: 'Applicant' }, { displayName: 'Other' }]);
    const source = await connection.getRepository(ProjectEntity).save({
      ownerUserId: users[1].id, title: 'Attachment ownership', description: 'Ownership fixture', direction: 'FundingOffered', visibility: 'Public', lifecycleStatus: 'Published', intakeStatus: 'Open', hardCapEnabled: false,
      content: { sourceType: 'Project', title: 'Attachment ownership', description: 'Ownership fixture', direction: 'FundingOffered', visibility: 'Public', lifecycleStatus: 'Published', intakeStatus: 'Open', hardCapEnabled: false, opportunityPolicy: { allowReapply: true }, questionnaire: { version: 1, questions: [{ id: 'document', type: 'Text', label: 'Plan', required: true, displayOrder: 1 }] } },
    });
    await connection.getRepository(ProjectVersionEntity).save({ projectId: source.id, version: 1, snapshot: source.content, reason: 'Published', contentHash: 'a'.repeat(64) });
    const attachments = await connection.getRepository(ApplicationAttachmentEntity).save(users.map((user) => ({ uploadedByUserId: user.id, organizationId: null, applicationId: null, storageKey: `fixture/${crypto.randomUUID()}`, mimeType: 'application/pdf', sizeBytes: '100', checksumSha256: 'a'.repeat(64), status: 'PendingUpload' })));
    const submit = (ids: string[]) => service.submitApplication({ sourceType: PublicationSourceType.Project, sourceId: source.id, applicantUserId: users[0].id, proposal: { direction: FundingDirection.FundingOffered }, answers: [{ questionKey: 'document', answer: 'Plan', attachmentIds: ids }] });
    await expect(submit([attachments[1].id])).rejects.toThrow('Application attachment is unavailable');
    await expect(submit([crypto.randomUUID()])).rejects.toThrow('Application attachment is unavailable');
    await expect(submit([attachments[0].id, attachments[0].id])).rejects.toThrow('identifiers must be unique');
    expect(await connection.getRepository(ApplicationEntity).count({ where: { sourceId: source.id } })).toBe(0);
    const application = await submit([attachments[0].id]);
    expect(application.status).toBe('PendingFileScan');
    expect((await connection.getRepository(ApplicationAttachmentEntity).findOneByOrFail({ id: attachments[0].id })).applicationId).toBe(application.id);
    expect((await connection.getRepository(ApplicationAnswerEntity).findOneByOrFail({ applicationId: application.id })).attachmentIds).toEqual([attachments[0].id]);
    await expect(submit([attachments[0].id])).rejects.toThrow('Application attachment is unavailable');
    const organizations = await connection.getRepository(OrganizationEntity).save(users.map((user) => ({ slug: `attachment-${crypto.randomUUID()}`, name: 'Applicant organization', organizationType: 'Nonprofit' as const, country: 'BO', legalStatus: 'Incorporated' as const, visibility: 'Private' as const, status: 'Active' as const, ownerUserId: user.id })));
    const organizationAttachment = await connection.getRepository(ApplicationAttachmentEntity).save({ uploadedByUserId: users[0].id, organizationId: organizations[0].id, applicationId: null, storageKey: `fixture/${crypto.randomUUID()}`, mimeType: 'application/pdf', sizeBytes: '100', checksumSha256: 'a'.repeat(64), status: 'PendingUpload' });
    const submitOrganization = (organizationId: string) => service.submitApplication({ sourceType: PublicationSourceType.Project, sourceId: source.id, applicantOrganizationId: organizationId, proposal: {}, answers: [{ questionKey: 'document', answer: 'Plan', attachmentIds: [organizationAttachment.id] }] });
    await expect(submitOrganization(organizations[1].id)).rejects.toThrow('Application attachment is unavailable');
    const orgApplication = await submitOrganization(organizations[0].id);
    expect((await connection.getRepository(ApplicationAttachmentEntity).findOneByOrFail({ id: organizationAttachment.id })).applicationId).toBe(orgApplication.id);
    const contested = await connection.getRepository(ApplicationAttachmentEntity).save({ uploadedByUserId: users[0].id, organizationId: organizations[0].id, applicationId: null, storageKey: `fixture/${crypto.randomUUID()}`, mimeType: 'application/pdf', sizeBytes: '100', checksumSha256: 'a'.repeat(64), status: 'PendingUpload' });
    const competingSubmission = () => service.submitApplication({ sourceType: PublicationSourceType.Project, sourceId: source.id, applicantOrganizationId: organizations[0].id, proposal: {}, answers: [{ questionKey: 'document', answer: 'Plan', attachmentIds: [contested.id] }] });
    const results = await Promise.allSettled([competingSubmission(), competingSubmission()]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });
});
