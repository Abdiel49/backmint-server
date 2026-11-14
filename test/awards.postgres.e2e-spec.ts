import { DataSource, In } from 'typeorm';
import dataSource from '../src/database/data-source.js';
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
    const createdProjectIds: string[] = [];
    const createdApplicationIds: string[] = [];
    const createdFundingOfferIds: string[] = [];
    const createdUserIds: string[] = [];

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
        ],
        migrations: [],
      });
      if (!connection.isInitialized) await connection.initialize();
      service = new AwardsService(connection);
    });

    afterAll(async () => {
      if (connection?.isInitialized) {
        if (createdProjectIds.length)
          await connection
            .getRepository(AwardEntity)
            .delete({ sourceId: In(createdProjectIds) });
        if (createdApplicationIds.length)
          await connection
            .getRepository(ApplicationEntity)
            .delete({ id: In(createdApplicationIds) });
        if (createdFundingOfferIds.length)
          await connection
            .getRepository(FundingOfferEntity)
            .delete({ id: In(createdFundingOfferIds) });
        if (createdProjectIds.length)
          await connection
            .getRepository(ProjectEntity)
            .delete({ id: In(createdProjectIds) });
        if (createdUserIds.length)
          await connection
            .getRepository(UserEntity)
            .delete({ id: In(createdUserIds) });
        await connection.destroy();
      }
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
        ]);
      createdUserIds.push(...users.map((user) => user.id));
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
      createdProjectIds.push(project.id);
      const applications = await connection
        .getRepository(ApplicationEntity)
        .save(
          users.slice(1).map((user, index) =>
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
              status: 'Selected',
              receipt: crypto.randomUUID(),
              withdrawnAt: null,
            }),
          ),
        );
      createdApplicationIds.push(
        ...applications.map((application) => application.id),
      );
      return { project, applications, users };
    }

    it('serializes concurrent awards against maxAwards and releases a decline exactly once', async () => {
      const { project, applications, users } = await fixture({
        maximumAwards: 1,
        budget: '100',
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
      createdUserIds.push(...users.map((user) => user.id));
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
      createdProjectIds.push(project.id);
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
      createdFundingOfferIds.push(offer.id);
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
      await expect(service.accept(award.id, users[0].id)).resolves.toMatchObject({
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
