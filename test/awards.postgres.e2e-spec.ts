import { DataSource } from 'typeorm';
import dataSource from '../src/database/data-source.js';
import { AuditEventEntity } from '../src/audit/audit-event.entity.js';
import { AuditPersistenceService } from '../src/audit/audit-persistence.service.js';
import {
  EvaluationAssignmentEntity,
  EvaluationEntity,
  EvaluationRoundEntity,
} from '../src/evaluations/evaluation.entity.js';
import { EvaluationsService } from '../src/evaluations/evaluations.service.js';
import {
  ApplicationAnswerEntity,
  ApplicationEntity,
  FundingOfferEntity,
} from '../src/publications/application.entity.js';
import { AwardEntity } from '../src/publications/award.entity.js';
import { AwardsService } from '../src/publications/awards.service.js';
import { ProjectEntity } from '../src/publications/project.entity.js';
import { UserEntity } from '../src/identity/user.entity.js';
import { IdentityProviderEntity } from '../src/identity/identity-provider.entity.js';
import { OrganizationEntity } from '../src/organizations/organization.entity.js';
import { ApplicationAttachmentEntity } from '../src/publications/application-attachment.entity.js';

const postgresIntegration = process.env.RUN_POSTGRES_INTEGRATION === 'true';

describe.skipIf(!postgresIntegration)(
  'AwardsService PostgreSQL reservations',
  () => {
    let connection: DataSource;
    let service: AwardsService;
    let evaluations: EvaluationsService;

    beforeAll(async () => {
      connection = new DataSource({
        ...dataSource.options,
        entities: [
          UserEntity,
          IdentityProviderEntity,
          ProjectEntity,
          ApplicationEntity,
          ApplicationAnswerEntity,
          ApplicationAttachmentEntity,
          FundingOfferEntity,
          AwardEntity,
          EvaluationRoundEntity,
          EvaluationAssignmentEntity,
          EvaluationEntity,
          AuditEventEntity,
          OrganizationEntity,
        ],
        migrations: [],
      });
      if (!connection.isInitialized) await connection.initialize();
      service = new AwardsService(connection);
      evaluations = new EvaluationsService(
        connection,
        new AuditPersistenceService(),
      );
    });

    afterAll(async () => {
      if (connection?.isInitialized) await connection.destroy();
    });

    async function fixture(input: { maximumAwards: number; budget: string }) {
      const users = await connection
        .getRepository(UserEntity)
        .save([
          connection
            .getRepository(UserEntity)
            .create({ displayName: `owner-${crypto.randomUUID()}` }),
          connection
            .getRepository(UserEntity)
            .create({ displayName: `recipient-${crypto.randomUUID()}` }),
          connection
            .getRepository(UserEntity)
            .create({ displayName: `recipient-${crypto.randomUUID()}` }),
          connection
            .getRepository(UserEntity)
            .create({ displayName: `reviewer-${crypto.randomUUID()}` }),
        ]);
      const project = await connection.getRepository(ProjectEntity).save(
        connection.getRepository(ProjectEntity).create({
          ownerUserId: users[0].id,
          title: 'Award reservation integration fixture',
          description: 'PostgreSQL reservation fixture',
          direction: 'FundingOffered',
          visibility: 'Public',
          lifecycleStatus: 'Published',
          intakeStatus: 'Open',
          targetAsset: 'near:testnet:token',
          hardCapEnabled: true,
          hardCapAmount: input.budget,
          content: {
            sourceType: 'Project',
            title: 'Award reservation integration fixture',
            description: 'PostgreSQL reservation fixture',
            direction: 'FundingOffered',
            visibility: 'Public',
            lifecycleStatus: 'Published',
            intakeStatus: 'Open',
            hardCapEnabled: true,
            opportunityPolicy: { maxAwards: input.maximumAwards },
          },
        }),
      );
      const applications = await connection
        .getRepository(ApplicationEntity)
        .save(
          users.slice(1, 3).map((user, index) =>
            connection.getRepository(ApplicationEntity).create({
              sourceType: 'Project',
              sourceId: project.id,
              applicantOrganizationId: null,
              applicantUserId: user.id,
              applicantKey: user.id,
              referencedProjectId: null,
              sourceVersion: 1,
              sourceSnapshot: { title: project.title },
              applicantSnapshot: { userId: user.id },
              proposalSnapshot: { index },
              status: 'Shortlisted',
              receipt: crypto.randomUUID(),
              withdrawnAt: null,
            }),
          ),
        );
      const round = await connection.getRepository(EvaluationRoundEntity).save(
        connection.getRepository(EvaluationRoundEntity).create({
          sourceType: 'Project',
          sourceId: project.id,
          stage: 'FinalReview',
          rubricVersion: 1,
          rubric: { quality: { maximum: 5 } },
          status: 'Open',
          createdByUserId: users[0].id,
        }),
      );
      const assignments = await connection
        .getRepository(EvaluationAssignmentEntity)
        .save(
          applications.map((application) =>
            connection.getRepository(EvaluationAssignmentEntity).create({
              roundId: round.id,
              evaluatorUserId: users[3].id,
              applicationId: application.id,
              fundingOfferId: null,
              conflictStatus: 'NoConflict',
              conflictReason: null,
              conflictDeclaredAt: new Date(),
              status: 'Submitted',
            }),
          ),
        );
      await connection.getRepository(EvaluationEntity).save(
        assignments.map((assignment) =>
          connection.getRepository(EvaluationEntity).create({
            assignmentId: assignment.id,
            version: 1,
            findings: { summary: 'Meets the published criteria' },
            rubricScores: { quality: 5 },
            eligibilityDecision: 'Eligible',
            deterministicEligibility: null,
            recommendation: 'Recommend',
            notes: 'Reviewed by an assigned, conflict-cleared evaluator.',
            submittedByUserId: users[3].id,
          }),
        ),
      );
      return { project, applications, users };
    }

    it('revalidates current organization type and country against the submitted policy before reserving an Award', async () => {
      const { project, users } = await fixture({ maximumAwards: 3, budget: '100' });
      const organizations = await connection.getRepository(OrganizationEntity).save(
        ['eligible', 'type', 'country'].map((label) => ({
          slug: `${label}-${crypto.randomUUID()}`,
          name: `Organization ${label}`,
          organizationType: 'Nonprofit' as const,
          country: 'BO',
          legalStatus: 'Incorporated' as const,
          visibility: 'Private' as const,
          status: 'Active' as const,
          ownerUserId: users[1].id,
        })),
      );
      const applications = await connection.getRepository(ApplicationEntity).save(
        organizations.map((organization) => ({
          sourceType: 'Project', sourceId: project.id,
          applicantOrganizationId: organization.id, applicantUserId: null,
          applicantKey: `organization:${organization.id}`, sourceVersion: 1,
          sourceSnapshot: { eligibilityRule: { audienceTypes: ['Nonprofit'], allowedJurisdictions: ['BO'] } },
          applicantSnapshot: { type: 'Nonprofit', country: 'BO', organizationId: organization.id },
          proposalSnapshot: {}, status: 'Selected', receipt: crypto.randomUUID(),
        })),
      );
      await connection.getRepository(OrganizationEntity).update({ id: organizations[1].id }, { organizationType: 'Company' });
      await connection.getRepository(OrganizationEntity).update({ id: organizations[2].id }, { country: 'CL' });
      const create = (index: number) => service.createFromApplication({
        applicationId: applications[index].id, allocation: '20', asset: 'near:testnet:token',
        expiresAt: new Date(Date.now() + 60_000), actorUserId: users[0].id,
      });
      await expect(create(1)).rejects.toThrow('audience requirements');
      await expect(create(2)).rejects.toThrow('allowed jurisdiction');
      for (const application of applications.slice(1)) {
        expect((await connection.getRepository(ApplicationEntity).findOneByOrFail({ id: application.id })).status).toBe('Selected');
        expect(await connection.getRepository(AwardEntity).count({ where: { applicationId: application.id } })).toBe(0);
      }
      await expect(create(0)).resolves.toMatchObject({ state: 'Offered', recipientOrganizationId: organizations[0].id });
    });

    it('requires linked clean attachments and passed answer scans before reserving an Award', async () => {
      const { project, applications, users } = await fixture({ maximumAwards: 2, budget: '100' });
      for (const application of applications) await evaluations.selectApplication({ applicationId: application.id, actorUserId: users[0].id });
      const attachments = await connection.getRepository(ApplicationAttachmentEntity).save(applications.map((application, index) => ({ uploadedByUserId: users[index + 1].id, organizationId: null, applicationId: application.id, storageKey: `fixture/${crypto.randomUUID()}`, mimeType: 'application/pdf', sizeBytes: '100', checksumSha256: 'a'.repeat(64), status: index ? 'Clean' : 'Quarantined' })));
      const answers = await connection.getRepository(ApplicationAnswerEntity).save(applications.map((application, index) => ({ applicationId: application.id, questionKey: 'document', answer: 'Plan', attachmentIds: [attachments[index].id], fileScanStatus: index ? 'Pending' : 'Passed' })));
      const create = (index: number) => service.createFromApplication({ applicationId: applications[index].id, allocation: '50', asset: 'near:testnet:token', expiresAt: new Date(Date.now() + 60_000), actorUserId: users[0].id });
      await expect(create(0)).rejects.toThrow('require verified scanning');
      await expect(create(1)).rejects.toThrow('require verified scanning');
      expect(await connection.getRepository(AwardEntity).count({ where: { sourceId: project.id } })).toBe(0);
      await connection.getRepository(ApplicationAnswerEntity).update({ id: answers[1].id }, { fileScanStatus: 'Passed' });
      await expect(create(1)).resolves.toMatchObject({ state: 'Offered' });
    });

    it('rejects unverified application attachments before reserving an Award', async () => {
      const { applications, users } = await fixture({ maximumAwards: 2, budget: '100' });
      for (const application of applications) {
        await evaluations.selectApplication({ applicationId: application.id, actorUserId: users[0].id });
      }
      await connection.getRepository(ApplicationAnswerEntity).save([
        { applicationId: applications[0].id, questionKey: 'supporting-document', answer: {}, attachmentIds: ['document-1'], fileScanStatus: 'Pending' },
        { applicationId: applications[1].id, questionKey: 'description', answer: 'Solar installation', attachmentIds: [], fileScanStatus: 'NotRequired' },
      ]);
      const create = (index: number) => service.createFromApplication({
        applicationId: applications[index].id, allocation: '50', asset: 'near:testnet:token',
        expiresAt: new Date(Date.now() + 60_000), actorUserId: users[0].id,
      });
      await expect(create(0)).rejects.toThrow('Application attachments require verified scanning');
      expect((await connection.getRepository(ApplicationEntity).findOneByOrFail({ id: applications[0].id })).status).toBe('Selected');
      expect(await connection.getRepository(AwardEntity).count({ where: { applicationId: applications[0].id } })).toBe(0);
      await expect(create(1)).resolves.toMatchObject({ state: 'Offered', allocation: '50' });
    });

    it('serializes concurrent awards against maxAwards and releases a decline exactly once', async () => {
      const { project, applications, users } = await fixture({
        maximumAwards: 1,
        budget: '100',
      });
      for (const application of applications)
        await evaluations.selectApplication({
          applicationId: application.id,
          actorUserId: project.ownerUserId!,
        });
      const results = await Promise.allSettled(
        applications.map((application) =>
          service.createFromApplication({
            applicationId: application.id,
            allocation: '60',
            asset: 'near:testnet:token',
            expiresAt: new Date(Date.now() + 60_000),
            actorUserId: project.ownerUserId!,
          }),
        ),
      );
      expect(
        results.filter((result) => result.status === 'fulfilled'),
        JSON.stringify(
          results.map((result) =>
            result.status === 'rejected' ? String(result.reason) : 'fulfilled',
          ),
        ),
      ).toHaveLength(1);
      const award = (
        results.find(
          (result) => result.status === 'fulfilled',
        ) as PromiseFulfilledResult<AwardEntity>
      ).value;
      const recipient = users.find(
        (user) => user.id === award.recipientUserId,
      )!;
      await service.decline(award.id, recipient.id);
      await expect(service.decline(award.id, recipient.id)).rejects.toThrow();
      const secondApplication = applications.find(
        (application) => application.id !== award.applicationId,
      )!;
      await expect(
        service.createFromApplication({
          applicationId: secondApplication.id,
          allocation: '60',
          asset: 'near:testnet:token',
          expiresAt: new Date(Date.now() + 60_000),
          actorUserId: project.ownerUserId!,
        }),
      ).resolves.toMatchObject({ state: 'Offered', allocation: '60' });
    });

    it('serializes concurrent awards against the hard-cap budget', async () => {
      const { project, applications } = await fixture({
        maximumAwards: 3,
        budget: '100',
      });
      for (const application of applications)
        await evaluations.selectApplication({
          applicationId: application.id,
          actorUserId: project.ownerUserId!,
        });
      const results = await Promise.allSettled(
        applications.map((application) =>
          service.createFromApplication({
            applicationId: application.id,
            allocation: '60',
            asset: 'near:testnet:token',
            expiresAt: new Date(Date.now() + 60_000),
            actorUserId: project.ownerUserId!,
          }),
        ),
      );
      expect(
        results.filter((result) => result.status === 'fulfilled'),
        JSON.stringify(
          results.map((result) =>
            result.status === 'rejected' ? String(result.reason) : 'fulfilled',
          ),
        ),
      ).toHaveLength(1);
    });

    it('creates a FundingOffer award and expires its reservation once', async () => {
      const users = await connection
        .getRepository(UserEntity)
        .save([
          connection
            .getRepository(UserEntity)
            .create({ displayName: `owner-${crypto.randomUUID()}` }),
          connection
            .getRepository(UserEntity)
            .create({ displayName: `funder-${crypto.randomUUID()}` }),
        ]);
      const project = await connection.getRepository(ProjectEntity).save(
        connection.getRepository(ProjectEntity).create({
          ownerUserId: users[0].id,
          title: 'Funding request reservation fixture',
          description: 'PostgreSQL FundingOffer fixture',
          direction: 'FundingRequested',
          visibility: 'Public',
          lifecycleStatus: 'Published',
          intakeStatus: 'Open',
          targetAsset: 'near:testnet:token',
          hardCapEnabled: true,
          hardCapAmount: '75',
          content: {
            sourceType: 'Project',
            title: 'Funding request reservation fixture',
            description: 'PostgreSQL FundingOffer fixture',
            direction: 'FundingRequested',
            visibility: 'Public',
            lifecycleStatus: 'Published',
            intakeStatus: 'Open',
            hardCapEnabled: true,
          },
        }),
      );
      const offer = await connection.getRepository(FundingOfferEntity).save(
        connection.getRepository(FundingOfferEntity).create({
          sourceType: 'Project',
          sourceId: project.id,
          funderOrganizationId: null,
          funderUserId: users[1].id,
          amount: '75',
          asset: 'near:testnet:token',
          supportDescription: null,
          supportType: null,
          restrictedPurpose: 'Equipment',
          conditionsSnapshot: { delivery: 'After agreement' },
          sourceSnapshot: { title: project.title },
          sourceVersion: 1,
          status: 'Accepted',
          receipt: crypto.randomUUID(),
          reviewedByUserId: users[0].id,
          reviewedAt: new Date(),
        }),
      );
      const award = await service.createFromFundingOffer({
        fundingOfferId: offer.id,
        expiresAt: new Date(Date.now() + 60_000),
        actorUserId: users[0].id,
        terms: { purpose: 'Equipment' },
      });
      expect(award).toMatchObject({
        fundingOfferId: offer.id,
        recipientUserId: users[0].id,
        allocation: '75',
        asset: 'near:testnet:token',
        state: 'Offered',
        termsSnapshot: {
          recipient: { organizationId: null, userId: users[0].id },
          funder: { organizationId: null, userId: users[1].id },
        },
      });
      await expect(
        service.accept(award.id, users[0].id),
      ).resolves.toMatchObject({
        state: 'Accepted',
        acceptedAt: expect.any(Date),
      });
      await expect(
        connection.query(
          'UPDATE "awards" SET "allocation" = $1 WHERE "id" = $2',
          ['76', award.id],
        ),
      ).rejects.toThrow('Award terms are immutable');
      await expect(
        service.expire(award.id, new Date(Date.now() + 120_000)),
      ).resolves.toMatchObject({
        state: 'Expired',
        releasedAt: expect.any(Date),
      });
      await expect(
        service.expire(award.id, new Date(Date.now() + 180_000)),
      ).rejects.toThrow('Award reservation has already been released');
    });
  },
);
