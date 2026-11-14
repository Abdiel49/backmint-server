import dataSource from '../dist/database/data-source.js';

async function countAppliedMigrations() {
  const rows = await dataSource.query(
    'SELECT COUNT(*)::integer AS count FROM "migrations"',
  );
  return rows[0]?.count ?? 0;
}

await dataSource.initialize();

try {
  const applied = await dataSource.runMigrations({ transaction: 'all' });
  const migrationCount = await countAppliedMigrations();

  if (!applied.length || migrationCount !== applied.length) {
    throw new Error(
      'A blank database did not apply every registered migration',
    );
  }

  for (let index = 0; index < migrationCount; index += 1) {
    await dataSource.undoLastMigration({ transaction: 'all' });
  }

  if ((await countAppliedMigrations()) !== 0) {
    throw new Error(
      'Migration rollback did not return the database to its initial schema',
    );
  }

  const reapplied = await dataSource.runMigrations({ transaction: 'all' });
  if (reapplied.length !== migrationCount) {
    throw new Error(
      'A blank database could not be migrated up again after rollback',
    );
  }
} finally {
  await dataSource.destroy();
}
