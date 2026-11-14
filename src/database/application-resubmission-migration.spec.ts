import { AddApplicationResubmissionLineage1795651200000 } from './migrations/1795651200000-AddApplicationResubmissionLineage.js';

describe('Application resubmission migration', () => {
  it('adds immutable predecessor lineage and enforces a single child per predecessor', async () => {
    const migration = new AddApplicationResubmissionLineage1795651200000();
    const queries: string[] = [];
    await migration.up({
      query: async (sql: string) => queries.push(sql),
    } as never);
    const sql = queries.join('\n');

    expect(sql).toContain('"supersedesApplicationId" uuid');
    expect(sql).toContain('ON DELETE RESTRICT');
    expect(sql).toContain('UQ_applications_single_resubmission');
    expect(sql).toContain('NEW."supersedesApplicationId"');
    expect(sql).toContain(
      'Submitted application snapshots and lineage are immutable',
    );
  });
});
