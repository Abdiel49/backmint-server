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
  ApplicationEntity,
  FundingOfferEntity,
} from '../src/publications/application.entity.js';
import { AwardEntity } from '../src/publications/award.entity.js';
import { AwardsService } from '../src/publications/awards.service.js';
import { ProjectEntity } from '../src/publications/project.entity.js';
import { UserEntity } from '../src/identity/user.entity.js';
import { IdentityProviderEntity } from '../src/identity/identity-provider.entity.js';

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
          FundingOfferEntity,
          AwardEntity,
          EvaluationRoundEntity,
          EvaluationAssignmentEntity,
          EvaluationEntity,
          AuditEventEntity,
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
