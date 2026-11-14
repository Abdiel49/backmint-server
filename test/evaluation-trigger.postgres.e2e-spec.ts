import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import dataSource from '../src/database/data-source.js';

describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== 'true')('Evaluation triggers in PostgreSQL', () => {
  let connection: DataSource;
  const ids = { owner: randomUUID(), reviewer: randomUUID(), other: randomUUID(), project: randomUUID(), application: randomUUID(), round: randomUUID(), assignment: randomUUID() };

  beforeAll(async () => {
    connection = new DataSource({ ...dataSource.options, migrations: [] });
    await connection.initialize();
    for (const id of [ids.owner, ids.reviewer, ids.other]) await connection.query('INSERT INTO "users" ("id", "displayName") VALUES ($1, $2)', [id, 'Evaluation fixture']);
    await connection.query(`INSERT INTO "projects" ("id", "ownerUserId", "title", "description", "direction", "content") VALUES ($1, $2, 'Evaluation', 'Fixture', 'FundingOffered', '{}')`, [ids.project, ids.owner]);
    await connection.query(`INSERT INTO "applications" ("id", "sourceType", "sourceId", "applicantUserId", "applicantKey", "sourceVersion", "sourceSnapshot", "applicantSnapshot", "proposalSnapshot", "status", "receipt") VALUES ($1, 'Project', $2, $3, $4, 1, '{}', '{}', '{}', 'Submitted', $5)`, [ids.application, ids.project, ids.owner, ids.owner, randomUUID()]);
    await connection.query(`INSERT INTO "evaluation_rounds" ("id", "sourceType", "sourceId", "stage", "rubricVersion", "rubric", "createdByUserId") VALUES ($1, 'Project', $2, 'Review', 1, '{}', $3)`, [ids.round, ids.project, ids.owner]);
    await connection.query(`INSERT INTO "evaluation_assignments" ("id", "roundId", "evaluatorUserId", "applicationId") VALUES ($1, $2, $3, $4)`, [ids.assignment, ids.round, ids.reviewer, ids.application]);
  });

  afterAll(async () => { if (connection?.isInitialized) await connection.destroy(); });

  it('allows round status changes while protecting rubric and identity', async () => {
    await connection.query('UPDATE "evaluation_rounds" SET "status" = $1 WHERE "id" = $2', ['Closed', ids.round]);
    await expect(connection.query('UPDATE "evaluation_rounds" SET "rubric" = $1 WHERE "id" = $2', [JSON.stringify({ score: 5 }), ids.round])).rejects.toThrow('rubric and identity are immutable');
    const rows = await connection.query('SELECT "status", "rubric" FROM "evaluation_rounds" WHERE "id" = $1', [ids.round]);
    expect(rows[0]).toMatchObject({ status: 'Closed', rubric: {} });
  });

  it('allows conflict declaration and status updates while protecting assignment identity and declaration', async () => {
    await connection.query('UPDATE "evaluation_assignments" SET "conflictStatus" = $1, "conflictDeclaredAt" = now(), "status" = $2 WHERE "id" = $3', ['NoConflict', 'InProgress', ids.assignment]);
    await connection.query('UPDATE "evaluation_assignments" SET "status" = $1 WHERE "id" = $2', ['Submitted', ids.assignment]);
    await expect(connection.query('UPDATE "evaluation_assignments" SET "evaluatorUserId" = $1 WHERE "id" = $2', [ids.other, ids.assignment])).rejects.toThrow('assignment identity is immutable');
    await expect(connection.query('UPDATE "evaluation_assignments" SET "conflictStatus" = $1, "conflictReason" = $2 WHERE "id" = $3', ['Declared', 'Changed', ids.assignment])).rejects.toThrow('conflict declaration is immutable');
    const rows = await connection.query('SELECT "status", "conflictStatus", "evaluatorUserId" FROM "evaluation_assignments" WHERE "id" = $1', [ids.assignment]);
    expect(rows[0]).toMatchObject({ status: 'Submitted', conflictStatus: 'NoConflict', evaluatorUserId: ids.reviewer });
  });
});
