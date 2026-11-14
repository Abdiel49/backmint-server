import { DataSource, type QueryRunner } from 'typeorm';
import dataSource from '../src/database/data-source.js';

const postgresIntegration = process.env.RUN_POSTGRES_INTEGRATION === 'true';

describe.skipIf(!postgresIntegration)(
  'Milestone and evidence PostgreSQL constraints',
  () => {
    let connection: DataSource;
    let runner: QueryRunner;
    let awardId: string;
    let ownerId: string;
    let recipientId: string;

    beforeAll(async () => {
      connection = new DataSource({
        ...dataSource.options,
        entities: [],
        migrations: [],
      });
      await connection.initialize();
    });

    afterAll(async () => {
      if (connection?.isInitialized) await connection.destroy();
    });

    beforeEach(async () => {
      runner = connection.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      const owner = await runner.query(
        `INSERT INTO "users" ("displayName") VALUES ('Milestone owner') RETURNING "id"`,
      );
      const recipient = await runner.query(
        `INSERT INTO "users" ("displayName") VALUES ('Milestone recipient') RETURNING "id"`,
      );
      ownerId = owner[0].id;
      recipientId = recipient[0].id;
      const offer = await runner.query(
        `INSERT INTO "funding_offers" ("sourceType", "sourceId", "funderUserId", "amount", "asset", "conditionsSnapshot", "sourceSnapshot", "sourceVersion", "status", "receipt") VALUES ('Project', $1, $2, 100, 'near:testnet:token', '{}', '{}', 1, 'Accepted', $3) RETURNING "id"`,
        [crypto.randomUUID(), ownerId, crypto.randomUUID()],
      );
      const award = await runner.query(
        `INSERT INTO "awards" ("sourceType", "sourceId", "fundingOfferId", "recipientUserId", "allocation", "asset", "expiresAt", "state", "termsSnapshot", "acceptedAt") VALUES ('Project', $1, $2, $3, 100, 'near:testnet:token', now() + interval '1 day', 'Accepted', '{}', now()) RETURNING "id"`,
        [crypto.randomUUID(), offer[0].id, recipientId],
      );
      awardId = award[0].id;
    });

    afterEach(async () => {
      await runner.rollbackTransaction();
      await runner.release();
    });

    async function createMilestone(sequence: number, amount: string) {
      const result = await runner.query(
        `INSERT INTO "milestones" ("awardId", "sequence") VALUES ($1, $2) RETURNING "id"`,
        [awardId, sequence],
      );
      const milestoneId = result[0].id as string;
      await runner.query(
        `INSERT INTO "milestone_terms_versions" ("milestoneId", "version", "acceptanceCriteria", "amount", "createdByUserId") VALUES ($1, 1, '{"checks":["demonstration"]}', $2, $3)`,
        [milestoneId, amount, ownerId],
      );
      return milestoneId;
    }

    let savepointIndex = 0;
    async function expectDatabaseError(
      query: string,
      parameters: unknown[],
      message: RegExp,
    ) {
      const savepoint = `expected_error_${savepointIndex++}`;
      await runner.query(`SAVEPOINT ${savepoint}`);
      await expect(runner.query(query, parameters)).rejects.toThrow(message);
      await runner.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      await runner.query(`RELEASE SAVEPOINT ${savepoint}`);
    }

    it('keeps milestone terms append-only, consecutive, and within the Award allocation', async () => {
      const firstId = await createMilestone(1, '60');
      await createMilestone(2, '30');
      const third = await runner.query(
        `INSERT INTO "milestones" ("awardId", "sequence") VALUES ($1, 3) RETURNING "id"`,
        [awardId],
      );
      await expectDatabaseError(
        `INSERT INTO "milestone_terms_versions" ("milestoneId", "version", "acceptanceCriteria", "amount", "createdByUserId") VALUES ($1, 1, '{}', 20, $2)`,
        [third[0].id, ownerId],
        /exceed Award allocation/,
      );
      await expectDatabaseError(
        `INSERT INTO "milestone_terms_versions" ("milestoneId", "version", "acceptanceCriteria", "amount", "createdByUserId") VALUES ($1, 3, '{}', 60, $2)`,
        [firstId, ownerId],
        /increase by exactly one/,
      );
      await expectDatabaseError(
        `UPDATE "milestone_terms_versions" SET "amount" = 1 WHERE "milestoneId" = $1 AND "version" = 1`,
        [firstId],
        /immutable/,
      );
    });

    it('stores private evidence versions and prevents metadata replacement', async () => {
      const milestoneId = await createMilestone(1, '100');
      const submission = await runner.query(
        `INSERT INTO "evidence_submissions" ("milestoneId", "version", "submittedByUserId") VALUES ($1, 1, $2) RETURNING "id"`,
        [milestoneId, recipientId],
      );
      const asset = await runner.query(
        `INSERT INTO "evidence_assets" ("evidenceSubmissionId", "storageKey", "checksumSha256", "mimeType", "sizeBytes") VALUES ($1, $2, $3, 'application/pdf', 2048) RETURNING "id", "visibility", "scanStatus"`,
        [submission[0].id, `evidence/${crypto.randomUUID()}`, 'a'.repeat(64)],
      );
      expect(asset[0]).toMatchObject({
        visibility: 'Private',
        scanStatus: 'Pending',
      });
      await expectDatabaseError(
        `UPDATE "evidence_assets" SET "storageKey" = 'public/replaced' WHERE "id" = $1`,
        [asset[0].id],
        /metadata is immutable/,
      );
      await expectDatabaseError(
        `UPDATE "evidence_assets" SET "visibility" = 'Public' WHERE "id" = $1`,
        [asset[0].id],
        /metadata is immutable/,
      );
      await runner.query(
        `UPDATE "evidence_assets" SET "scanStatus" = 'Passed' WHERE "id" = $1`,
        [asset[0].id],
      );
      await expectDatabaseError(
        `INSERT INTO "evidence_submissions" ("milestoneId", "version", "submittedByUserId") VALUES ($1, 3, $2)`,
        [milestoneId, recipientId],
        /increase by exactly one/,
      );
    });

    it('does not let milestone approval imply payment', async () => {
      const milestoneId = await createMilestone(1, '100');
      await expectDatabaseError(
        `UPDATE "milestones" SET "status" = 'Paid', "stateVersion" = 2 WHERE "id" = $1`,
        [milestoneId],
        /allowed versioned state transition/,
      );
      await runner.query(
        `UPDATE "milestones" SET "status" = 'Ready', "stateVersion" = 2 WHERE "id" = $1`,
        [milestoneId],
      );
    });
  },
);
