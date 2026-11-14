import { createHash, randomUUID } from 'node:crypto';
import { KeyPair } from 'near-api-js';
import { DataSource } from 'typeorm';
import dataSource from '../src/database/data-source.js';
import {
  AgreementEntity,
  AgreementFinanceConfirmationEntity,
  AgreementPartyAcceptanceEntity,
  AgreementTerms,
  AgreementVersionEntity,
} from '../src/agreements/agreement.entity.js';
import { AgreementAcceptanceChallengeEntity } from '../src/agreements/agreement-acceptance-challenge.entity.js';
import { AgreementsService } from '../src/agreements/agreements.service.js';
import { encodeNep413Payload } from '../src/identity/wallet-link.service.js';
import { WalletLinkEntity } from '../src/identity/wallet-link.entity.js';
import { ChainOperationEntity } from '../src/finance/chain-operation.entity.js';
import { OrganizationEntity } from '../src/organizations/organization.entity.js';
import { OrganizationMembershipEntity } from '../src/organizations/organization-membership.entity.js';
import { OrganizationRepresentativeEntity } from '../src/organizations/organization-representative.entity.js';
import { AwardEntity } from '../src/publications/award.entity.js';
import {
  ApplicationEntity,
  FundingOfferEntity,
} from '../src/publications/application.entity.js';
import { ProjectEntity } from '../src/publications/project.entity.js';
import { UserEntity } from '../src/identity/user.entity.js';
import { IdentityProviderEntity } from '../src/identity/identity-provider.entity.js';
import { MilestoneEntity, MilestoneTermsVersionEntity } from '../src/milestones/milestone.entity.js';

const postgresIntegration = process.env.RUN_POSTGRES_INTEGRATION === 'true';

describe.skipIf(!postgresIntegration)(
  'Agreements PostgreSQL foundations',
  () => {
    let connection: DataSource;
    let service: AgreementsService;

    beforeAll(async () => {
      connection = new DataSource({
        ...dataSource.options,
        entities: [
          AgreementEntity,
          AgreementAcceptanceChallengeEntity,
          AgreementVersionEntity,
          AgreementPartyAcceptanceEntity,
          AgreementFinanceConfirmationEntity,
          AwardEntity,
          ApplicationEntity,
          FundingOfferEntity,
          ProjectEntity,
          UserEntity,
          WalletLinkEntity,
          IdentityProviderEntity,
          ChainOperationEntity,
          OrganizationEntity,
          OrganizationMembershipEntity,
          OrganizationRepresentativeEntity,
          MilestoneEntity,
          MilestoneTermsVersionEntity,
        ],
        migrations: [],
      });
      await connection.initialize();
      service = new AgreementsService(connection, {
        network: 'testnet',
        challengeRecipient: 'backmint-test',
        challengeTtlSeconds: 300,
      });
    });

    afterAll(async () => {
      if (connection?.isInitialized) await connection.destroy();
    });

    const signingWallets = new Map<
      string,
      { keyPair: ReturnType<typeof KeyPair.fromRandom> }
    >();

    async function acceptForTest(
      agreementId: string,
      actorUserId: string,
      expectedVersion: number,
      expectedHash: string,
      partyKey: string,
    ) {
      let signingWallet = signingWallets.get(actorUserId);
      if (!signingWallet) {
        const keyPair = KeyPair.fromRandom('ed25519');
        await connection.getRepository(WalletLinkEntity).save({
          userId: actorUserId,
          accountId: `${randomUUID().replaceAll('-', '')}.testnet`,
          network: 'testnet',
          publicKey: keyPair.getPublicKey().toString(),
          verifiedAt: new Date(),
          revokedAt: null,
        });
        signingWallet = { keyPair };
        signingWallets.set(actorUserId, signingWallet);
      }
      const challenge = await service.issueAcceptanceChallenge(
        agreementId,
        actorUserId,
        expectedVersion,
        expectedHash,
        partyKey,
      );
      const nonce = Buffer.from(challenge.nonce, 'base64');
      const digest = createHash('sha256')
        .update(
          encodeNep413Payload(
            challenge.message,
            nonce,
            challenge.recipient,
          ),
        )
        .digest();
      const signature = Buffer.from(
        signingWallet.keyPair.sign(digest).signature,
      ).toString('base64');
      return service.accept(
        agreementId,
        actorUserId,
        expectedVersion,
        expectedHash,
        partyKey,
        challenge.id,
        challenge.nonce,
        signature,
      );
    }

    async function fixture() {
      const users = await connection
        .getRepository(UserEntity)
        .save(
          connection
            .getRepository(UserEntity)
            .create([
              { displayName: `agreement-recipient-${randomUUID()}` },
              { displayName: `agreement-source-owner-${randomUUID()}` },
            ]),
        );
      const projectId = randomUUID();
      await connection.query(
        `INSERT INTO "projects" ("id", "ownerUserId", "title", "description", "direction", "lifecycleStatus", "targetAsset", "content") VALUES ($1, $2, 'Agreement source', 'Integration fixture source', 'FundingOffered', 'Published', 'token.testnet', '{}')`,
        [projectId, users[1].id],
      );
      const applicationId = randomUUID();
      await connection.query(
        `INSERT INTO "applications" ("id", "sourceType", "sourceId", "applicantUserId", "applicantKey", "sourceVersion", "sourceSnapshot", "applicantSnapshot", "proposalSnapshot", "status", "receipt") VALUES ($1, 'Project', $2, $3, $4, 1, '{}', '{}', '{}', 'Awarded', $5)`,
        [applicationId, projectId, users[0].id, users[0].id, randomUUID()],
      );
      const awardId = randomUUID();
      await connection.query(
        `INSERT INTO "awards" ("id", "sourceType", "sourceId", "applicationId", "recipientUserId", "allocation", "asset", "expiresAt", "state", "termsSnapshot", "acceptedAt") VALUES ($1, 'Project', $2, $3, $4, '5000', 'token.testnet', now() + interval '1 day', 'Accepted', '{}', now())`,
        [awardId, projectId, applicationId, users[0].id],
      );
      return {
        awardId,
        recipientId: users[0].id,
        funderId: users[1].id,
        otherUserId: users[1].id,
      };
    }

    function input(
      recipientId: string,
      funderId: string,
      termsOverrides: Partial<AgreementTerms> = {},
    ) {
      const terms: AgreementTerms = {
        network: 'near:testnet',
        asset: 'token.testnet',
        parties: [
          {
            key: 'funder',
            role: 'Funder',
            userId: funderId,
            required: true,
          },
          {
            key: 'recipient',
            role: 'Recipient',
            userId: recipientId,
            required: true,
          },
        ],
        milestones: [{ sequence: 1, allocationBaseUnits: '5000', acceptanceCriteria: { deliverable: 'Completed work' }, reviewerUserId: funderId, dueAt: '2027-01-01T00:00:00.000Z' }],
        verificationAuthority: { kind: 'independent-review' },
        deadlines: { acceptance: '2027-01-01T00:00:00.000Z' },
        cancellationPolicy: { noticeDays: 14 },
        disputePolicy: { forum: 'mediation' },
        refundPolicy: { rule: 'unspent-only' },
        legalTerms: { jurisdiction: 'BO' },
        economicTerms: { allocationBaseUnits: '5000', trancheCount: 1 },
        ...termsOverrides,
      };
      return {
        terms,
        acceptanceExpiresAt: new Date(Date.now() + 60_000),
        contractArtifactReference: 'backmint-escrow@v1',
      };
    }

    it('persists immutable agreement versions and prevents a second agreement per Award', async () => {
      const { awardId, recipientId, funderId } = await fixture();
      const agreement = await service.createFromAward(
        awardId,
        recipientId,
        input(recipientId, funderId),
      );
      const original = await connection
        .getRepository(AgreementVersionEntity)
        .findOneByOrFail({
          agreementId: agreement.id,
          version: 1,
        });
      expect(original.economicTermsHash).toMatch(/^[a-f0-9]{64}$/);
      expect(original.termsHash).toMatch(/^[a-f0-9]{64}$/);
      await expect(
        connection.query(
          'UPDATE "agreement_versions" SET "terms" = \'{}\' WHERE "id" = $1',
          [original.id],
        ),
      ).rejects.toThrow('immutable');
      await expect(
        service.createFromAward(
          awardId,
          recipientId,
          input(recipientId, funderId),
        ),
      ).rejects.toThrow();
      await expect(
        service.createFromAward(
          awardId,
          recipientId,
          input(recipientId, randomUUID()),
        ),
      ).rejects.toThrow('Funder and Recipient');
    });

    it('rejects milestone allocation totals above the Award on creation and amendment', async () => {
      const { awardId, recipientId, funderId } = await fixture();
      const overAllocatedInput = input(recipientId, funderId, {
        milestones: [
          { key: 'phase-one', allocationBaseUnits: '3000' },
          { key: 'phase-two', allocation: '2001' },
        ],
      });
      await expect(
        service.createFromAward(awardId, recipientId, overAllocatedInput),
      ).rejects.toThrow('cannot exceed the accepted Award allocation');

      const agreement = await service.createFromAward(
        awardId,
        recipientId,
        input(recipientId, funderId, {
          milestones: [{ key: 'phase-one', allocationBaseUnits: '3000' }],
        }),
      );
      await expect(
        service.createVersion(
          agreement.id,
          recipientId,
          input(recipientId, funderId, {
            milestones: [
              { key: 'phase-one', allocation: '3000' },
              { key: 'phase-two', allocationBaseUnits: '2001' },
            ],
          }),
        ),
      ).rejects.toThrow('cannot exceed the accepted Award allocation');
    });

    it('rejects incomplete or overallocated milestone schedules before requesting signatures', async () => {
      const { awardId, recipientId, funderId } = await fixture();
      const agreement = await service.createFromAward(awardId, recipientId, input(recipientId, funderId, {
        milestones: [{ sequence: 1, allocationBaseUnits: '4000', reviewerUserId: funderId }],
      }));
      await expect(service.submitForAcceptance(agreement.id, recipientId)).rejects.toThrow('acceptanceCriteria');
      await service.createVersion(agreement.id, recipientId, input(recipientId, funderId, {
        economicTerms: { allocationBaseUnits: '3000' },
        milestones: [{ sequence: 1, allocationBaseUnits: '4000', acceptanceCriteria: { deliverable: 'Completed work' }, reviewerUserId: funderId }],
      }));
      await expect(service.submitForAcceptance(agreement.id, recipientId)).rejects.toThrow('cannot exceed the Agreement allocation');
      expect(await connection.getRepository(MilestoneEntity).count({ where: { awardId } })).toBe(0);
    });

    it('rolls back final acceptance if operational milestones already exist', async () => {
      const { awardId, recipientId, funderId } = await fixture();
      const agreement = await service.createFromAward(awardId, recipientId, input(recipientId, funderId));
      await service.submitForAcceptance(agreement.id, recipientId);
      const version = await connection.getRepository(AgreementVersionEntity).findOneByOrFail({ agreementId: agreement.id, version: 1 });
      await acceptForTest(agreement.id, recipientId, 1, version.termsHash, 'recipient');
      await connection.getRepository(MilestoneEntity).save({ awardId, sequence: 1 });
      await expect(acceptForTest(agreement.id, funderId, 1, version.termsHash, 'funder')).rejects.toThrow('already has operational milestones');
      const current = await connection.getRepository(AgreementEntity).findOneByOrFail({ id: agreement.id });
      expect(current.status).toBe('PendingAcceptance');
      expect(await connection.getRepository(AgreementPartyAcceptanceEntity).count({ where: { agreementId: agreement.id } })).toBe(1);
      expect(await connection.getRepository(MilestoneEntity).count({ where: { awardId } })).toBe(1);
    });

    it('materializes two milestones from the accepted amended version', async () => {
      const { awardId, recipientId, funderId } = await fixture();
      const agreement = await service.createFromAward(awardId, recipientId, input(recipientId, funderId));
      await service.createVersion(agreement.id, recipientId, input(recipientId, funderId, {
        milestones: [
          { sequence: 1, allocationBaseUnits: '3000', acceptanceCriteria: { result: 'First delivery' }, reviewerUserId: funderId },
          { sequence: 2, allocationBaseUnits: '2000', acceptanceCriteria: { result: 'Second delivery' }, reviewerUserId: funderId },
        ],
      }));
      await service.submitForAcceptance(agreement.id, recipientId);
      const version = await connection.getRepository(AgreementVersionEntity).findOneByOrFail({ agreementId: agreement.id, version: 2 });
      await acceptForTest(agreement.id, recipientId, 2, version.termsHash, 'recipient');
      await acceptForTest(agreement.id, funderId, 2, version.termsHash, 'funder');
      const milestones = await connection.getRepository(MilestoneEntity).find({ where: { awardId }, order: { sequence: 'ASC' } });
      expect(milestones.map((item) => item.sequence)).toEqual([1, 2]);
      const terms = await Promise.all(milestones.map((item) => connection.getRepository(MilestoneTermsVersionEntity).findOneByOrFail({ milestoneId: item.id, version: 1 })));
      expect(terms.map((item) => item.amount)).toEqual(['3000', '2000']);
      expect(terms.map((item) => item.acceptanceCriteria)).toEqual([{ result: 'First delivery' }, { result: 'Second delivery' }]);
    });

    it('requires exact current version/hash, authorized party, and all required acceptances', async () => {
      const { awardId, recipientId, funderId, otherUserId } = await fixture();
      const agreement = await service.createFromAward(
        awardId,
        recipientId,
        input(recipientId, funderId),
      );
      await service.submitForAcceptance(agreement.id, recipientId);
      const oldVersion = await connection
        .getRepository(AgreementVersionEntity)
        .findOneByOrFail({ agreementId: agreement.id, version: 1 });
      await service.createVersion(
        agreement.id,
        recipientId,
        input(recipientId, funderId, {
          economicTerms: { allocationBaseUnits: '5000', trancheCount: 2 },
        }),
      );
      await service.submitForAcceptance(agreement.id, recipientId);
      await expect(
        acceptForTest(
          agreement.id,
          recipientId,
          1,
          oldVersion.termsHash,
          'recipient',
        ),
      ).rejects.toThrow('stale');
      const current = await connection
        .getRepository(AgreementVersionEntity)
        .findOneByOrFail({ agreementId: agreement.id, version: 2 });
      await expect(
        acceptForTest(
          agreement.id,
          otherUserId,
          2,
          current.termsHash,
          'recipient',
        ),
      ).rejects.toThrow('named user party');
      await expect(
        acceptForTest(
          agreement.id,
          recipientId,
          2,
          current.economicTermsHash,
          'recipient',
        ),
      ).rejects.toThrow('hash');
      await expect(
        acceptForTest(
          agreement.id,
          recipientId,
          2,
          current.termsHash,
          'recipient',
        ),
      ).resolves.toMatchObject({ status: 'PendingAcceptance' });
      await expect(
        acceptForTest(
          agreement.id,
          recipientId,
          2,
          current.termsHash,
          'recipient',
        ),
      ).resolves.toMatchObject({ status: 'PendingAcceptance' });
      await expect(
        acceptForTest(agreement.id, funderId, 2, current.termsHash, 'funder'),
      ).resolves.toMatchObject({ status: 'Accepted' });
      const milestones = await connection.getRepository(MilestoneEntity).find({ where: { awardId } });
      expect(milestones).toHaveLength(1);
      expect(milestones[0]).toMatchObject({ sequence: 1, reviewerUserId: funderId, currentTermsVersion: 1 });
      const milestoneTerms = await connection.getRepository(MilestoneTermsVersionEntity).findOneByOrFail({ milestoneId: milestones[0].id, version: 1 });
      expect(milestoneTerms).toMatchObject({ amount: '5000', reviewerUserId: funderId, acceptanceCriteria: { deliverable: 'Completed work' } });
    });

    it('requires verified, active representative authority for organization parties', async () => {
      const users = await connection
        .getRepository(UserEntity)
        .save(
          connection
            .getRepository(UserEntity)
            .create([
              { displayName: `agreement-org-recipient-${randomUUID()}` },
              { displayName: `agreement-org-owner-${randomUUID()}` },
              { displayName: `agreement-expired-rep-${randomUUID()}` },
              { displayName: `agreement-valid-rep-${randomUUID()}` },
            ]),
        );
      const organization = await connection
        .getRepository(OrganizationEntity)
        .save(
          connection.getRepository(OrganizationEntity).create({
            slug: `agreement-${randomUUID()}`,
            name: 'Agreement party organization',
            organizationType: 'Foundation',
            country: 'BO',
            legalStatus: 'Incorporated',
            ownerUserId: users[1].id,
          }),
        );
      const projectId = randomUUID();
      await connection.query(
        `INSERT INTO "projects" ("id", "ownerOrganizationId", "title", "description", "direction", "lifecycleStatus", "targetAsset", "content") VALUES ($1, $2, 'Organization agreement source', 'Integration fixture source', 'FundingOffered', 'Published', 'token.testnet', '{}')`,
        [projectId, organization.id],
      );
      const applicationId = randomUUID();
      await connection.query(
        `INSERT INTO "applications" ("id", "sourceType", "sourceId", "applicantUserId", "applicantKey", "sourceVersion", "sourceSnapshot", "applicantSnapshot", "proposalSnapshot", "status", "receipt") VALUES ($1, 'Project', $2, $3, $4, 1, '{}', '{}', '{}', 'Awarded', $5)`,
        [applicationId, projectId, users[0].id, users[0].id, randomUUID()],
      );
      const awardId = randomUUID();
      await connection.query(
        `INSERT INTO "awards" ("id", "sourceType", "sourceId", "applicationId", "recipientUserId", "allocation", "asset", "expiresAt", "state", "termsSnapshot", "acceptedAt") VALUES ($1, 'Project', $2, $3, $4, '5000', 'token.testnet', now() + interval '1 day', 'Accepted', '{}', now())`,
        [awardId, projectId, applicationId, users[0].id],
      );
      const termsInput = input(users[0].id, users[1].id, {
        parties: [
          {
            key: 'funder',
            role: 'Funder',
            organizationId: organization.id,
            required: true,
          },
          {
            key: 'recipient',
            role: 'Recipient',
            userId: users[0].id,
            required: true,
          },
        ],
      });
      const agreement = await service.createFromAward(
        awardId,
        users[0].id,
        termsInput,
      );
      await service.submitForAcceptance(agreement.id, users[0].id);
      const version = await connection
        .getRepository(AgreementVersionEntity)
        .findOneByOrFail({ agreementId: agreement.id, version: 1 });
      await acceptForTest(
        agreement.id,
        users[0].id,
        1,
        version.termsHash,
        'recipient',
      );
      await expect(
        acceptForTest(
          agreement.id,
          users[1].id,
          1,
          version.termsHash,
          'funder',
        ),
      ).rejects.toThrow('Active representative authority');

      const expiredMembership = await connection
        .getRepository(OrganizationMembershipEntity)
        .save(
          connection.getRepository(OrganizationMembershipEntity).create({
            organizationId: organization.id,
            userId: users[2].id,
            role: 'Representative',
            status: 'Active',
            invitedByUserId: users[1].id,
            acceptedAt: new Date(),
            revokedAt: null,
          }),
        );
      void expiredMembership;
      await connection.getRepository(OrganizationRepresentativeEntity).save({
        organizationId: organization.id,
        userId: users[2].id,
        verifiedByUserId: users[1].id,
        verifiedAt: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() - 1),
        verificationReference: 'expired authority record',
        revokedAt: null,
        revokedByUserId: null,
        revocationReason: null,
      });
      await expect(
        acceptForTest(
          agreement.id,
          users[2].id,
          1,
          version.termsHash,
          'funder',
        ),
      ).rejects.toThrow('Active representative authority');

      await connection.getRepository(OrganizationMembershipEntity).save(
        connection.getRepository(OrganizationMembershipEntity).create({
          organizationId: organization.id,
          userId: users[3].id,
          role: 'Representative',
          status: 'Active',
          invitedByUserId: users[1].id,
          acceptedAt: new Date(),
          revokedAt: null,
        }),
      );
      await connection.getRepository(OrganizationRepresentativeEntity).save({
        organizationId: organization.id,
        userId: users[3].id,
        verifiedByUserId: users[1].id,
        verifiedAt: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() + 60_000),
        verificationReference: 'verified authority record',
        revokedAt: null,
        revokedByUserId: null,
        revocationReason: null,
      });
      await expect(
        acceptForTest(
          agreement.id,
          users[3].id,
          1,
          version.termsHash,
          'funder',
        ),
      ).resolves.toMatchObject({ status: 'Accepted' });
    });

    it('binds FundingOffer counterparties to the offer author and source owner', async () => {
      const { recipientId, funderId } = await fixture();
      const projectId = randomUUID();
      await connection.query(
        `INSERT INTO "projects" ("id", "ownerUserId", "title", "description", "direction", "lifecycleStatus", "targetAsset", "content") VALUES ($1, $2, 'Funding request source', 'FundingOffer agreement fixture', 'FundingRequested', 'Published', 'token.testnet', '{}')`,
        [projectId, recipientId],
      );
      const offerId = randomUUID();
      await connection.query(
        `INSERT INTO "funding_offers" ("id", "sourceType", "sourceId", "funderUserId", "amount", "asset", "conditionsSnapshot", "sourceSnapshot", "sourceVersion", "status", "receipt") VALUES ($1, 'Project', $2, $3, '5000', 'token.testnet', '{}', '{}', 1, 'Awarded', $4)`,
        [offerId, projectId, funderId, randomUUID()],
      );
      const awardId = randomUUID();
      await connection.query(
        `INSERT INTO "awards" ("id", "sourceType", "sourceId", "fundingOfferId", "recipientUserId", "allocation", "asset", "expiresAt", "state", "termsSnapshot", "acceptedAt") VALUES ($1, 'Project', $2, $3, $4, '5000', 'token.testnet', now() + interval '1 day', 'Accepted', '{}', now())`,
        [awardId, projectId, offerId, recipientId],
      );
      await expect(
        service.createFromAward(
          awardId,
          recipientId,
          input(recipientId, funderId),
        ),
      ).resolves.toMatchObject({ awardId, status: 'Draft' });
      const forgedFunder = randomUUID();
      const forgedTerms = input(recipientId, forgedFunder);
      await expect(
        service.createFromAward(awardId, recipientId, forgedTerms),
      ).rejects.toThrow('Funder and Recipient');
    });

    it('does not permit funding or active states without persisted confirmed chain status', async () => {
      const { awardId, recipientId, funderId } = await fixture();
      const agreement = await service.createFromAward(
        awardId,
        recipientId,
        input(recipientId, funderId),
      );
      await service.submitForAcceptance(agreement.id, recipientId);
      const version = await connection
        .getRepository(AgreementVersionEntity)
        .findOneByOrFail({ agreementId: agreement.id, version: 1 });
      await acceptForTest(
        agreement.id,
        recipientId,
        1,
        version.termsHash,
        'recipient',
      );
      await acceptForTest(
        agreement.id,
        funderId,
        1,
        version.termsHash,
        'funder',
      );
      await service.transition(agreement.id, 'AwaitingFunding');
      await expect(service.transition(agreement.id, 'Funded')).rejects.toThrow(
        'dedicated acceptance or chain confirmation flow',
      );
      await expect(service.transition(agreement.id, 'Active')).rejects.toThrow(
        'Invalid Agreement transition',
      );
    });

    it('advances funding and active status only from persisted confirmed matching chain data', async () => {
      const { awardId, recipientId, funderId } = await fixture();
      const agreement = await service.createFromAward(
        awardId,
        recipientId,
        input(recipientId, funderId),
      );
      await service.submitForAcceptance(agreement.id, recipientId);
      const version = await connection
        .getRepository(AgreementVersionEntity)
        .findOneByOrFail({ agreementId: agreement.id, version: 1 });
      await acceptForTest(
        agreement.id,
        recipientId,
        1,
        version.termsHash,
        'recipient',
      );
      await acceptForTest(
        agreement.id,
        funderId,
        1,
        version.termsHash,
        'funder',
      );
      await service.transition(agreement.id, 'AwaitingFunding');
      const chainOperationId = randomUUID();
      await connection.query(
        `INSERT INTO "chain_operations" ("id", "idempotencyKey", "operationType", "payloadHash", "requestedBy", "correlationId", "status", "intent", "transactionHash") VALUES ($1, $2, 'RegisterAgreement', $3, $4, $5, 'Confirmed', $6, $7)`,
        [
          chainOperationId,
          randomUUID(),
          'a'.repeat(64),
          recipientId,
          randomUUID(),
          JSON.stringify({
            agreementId: agreement.id,
            termsHash: version.economicTermsHash,
            network: version.terms.network,
          }),
          `tx-${randomUUID()}`,
        ],
      );
      await expect(
        service.confirmFundingFromChain(
          agreement.id,
          chainOperationId,
          'Funded',
        ),
      ).resolves.toMatchObject({ status: 'Funded' });
      await expect(
        service.transition(agreement.id, 'Active'),
      ).resolves.toMatchObject({
        status: 'Active',
      });
    });
  },
);
