import {
  assertMigrationFileName,
  assertUtcTimestamp,
} from './persistence-conventions.js';

describe('persistence conventions', () => {
  it('accepts timestamped PascalCase migration names', () => {
    expect(() =>
      assertMigrationFileName('1794614400000-CreateDomainOutboxEvents.ts'),
    ).not.toThrow();
  });

  it.each([
    'CreateProject.ts',
    '1794614400000-create-project.ts',
    '179461440000-CreateProject.ts',
    '1794614400000-CreateProject.js',
  ])('rejects noncanonical migration filename %s', (fileName) => {
    expect(() => assertMigrationFileName(fileName)).toThrow(TypeError);
  });

  it('accepts valid timestamps and rejects invalid dates', () => {
    expect(() =>
      assertUtcTimestamp(new Date('2026-11-14T00:00:00.000Z')),
    ).not.toThrow();
    expect(() => assertUtcTimestamp(new Date('invalid'))).toThrow(TypeError);
  });
});
