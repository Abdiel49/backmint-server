import { createHash } from 'node:crypto';

export type SnapshotValue =
  | null
  | boolean
  | number
  | string
  | SnapshotValue[]
  | { [key: string]: SnapshotValue };

export type SnapshotIdentity = {
  sourceType: string;
  sourceId: string;
  version: number;
  createdAt?: Date;
};

export type VersionedSnapshot<T extends SnapshotValue> = Readonly<{
  sourceType: string;
  sourceId: string;
  version: number;
  createdAt: string;
  content: Readonly<T>;
  canonicalContent: string;
  contentHash: string;
}>;

function canonicalize(value: SnapshotValue, ancestors = new Set<object>()): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new TypeError('Snapshot numbers must be finite');
    }

    return JSON.stringify(value);
  }

  if (ancestors.has(value)) {
    throw new TypeError('Snapshot content cannot contain circular references');
  }

  ancestors.add(value);
  const result = Array.isArray(value)
    ? `[${value.map((item) => canonicalize(item, ancestors)).join(',')}]`
    : `{${Object.keys(value)
        .sort()
        .map((key) => {
          const item = value[key];

          if (item === undefined) {
            throw new TypeError('Snapshot content cannot contain undefined values');
          }

          return `${JSON.stringify(key)}:${canonicalize(item, ancestors)}`;
        })
        .join(',')}}`;
  ancestors.delete(value);

  return result;
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);

    for (const child of Object.values(value)) {
      freezeDeep(child);
    }
  }

  return value;
}

export function createVersionedSnapshot<T extends SnapshotValue>(
  identity: SnapshotIdentity,
  source: T,
): VersionedSnapshot<T> {
  if (!identity.sourceType.trim() || !identity.sourceId.trim()) {
    throw new TypeError('Snapshot sourceType and sourceId are required');
  }

  if (!Number.isSafeInteger(identity.version) || identity.version < 1) {
    throw new RangeError('Snapshot version must be a positive safe integer');
  }

  const canonicalContent = canonicalize(source);
  const content = JSON.parse(canonicalContent) as T;
  const createdAt = identity.createdAt ?? new Date();

  if (Number.isNaN(createdAt.getTime())) {
    throw new TypeError('Snapshot creation time must be a valid date');
  }

  const hashInput = [
    'backmint-snapshot-v1',
    identity.sourceType,
    identity.sourceId,
    String(identity.version),
    canonicalContent,
  ].join('\n');
  const contentHash = createHash('sha256').update(hashInput).digest('hex');

  return Object.freeze({
    sourceType: identity.sourceType,
    sourceId: identity.sourceId,
    version: identity.version,
    createdAt: createdAt.toISOString(),
    content: freezeDeep(content),
    canonicalContent,
    contentHash,
  });
}
