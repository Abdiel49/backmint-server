export const MIGRATION_NAME_PATTERN =
  /^[0-9]{13}-[A-Z][A-Za-z0-9]*\.ts$/;

export function assertMigrationFileName(fileName: string): void {
  if (!MIGRATION_NAME_PATTERN.test(fileName)) {
    throw new TypeError(
      'Migration filenames must use a 13-digit timestamp and PascalCase description',
    );
  }
}

export function assertUtcTimestamp(value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError('Timestamp must be a valid Date');
  }
}
