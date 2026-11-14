import {
  createVersionedSnapshot,
  type SnapshotValue,
} from './versioned-snapshot.js';

describe('versioned snapshots', () => {
  it('detaches and deeply freezes the captured source data', () => {
    const source = {
      title: 'Community garden',
      objectives: ['Build beds'],
      policy: { visibility: 'Public' },
    };
    const snapshot = createVersionedSnapshot(
      {
        sourceType: 'Project',
        sourceId: 'project-123',
        version: 1,
        createdAt: new Date('2026-11-14T00:00:00.000Z'),
      },
      source,
    );
    const originalHash = snapshot.contentHash;

    source.title = 'Changed after submission';
    source.objectives.push('New objective');

    expect(snapshot.content.title).toBe('Community garden');
    expect(snapshot.content.objectives).toEqual(['Build beds']);
    expect(snapshot.contentHash).toBe(originalHash);
    expect(Object.isFrozen(snapshot.content.policy)).toBe(true);
    expect(() => {
      (snapshot.content.policy as { visibility: string }).visibility = 'Private';
    }).toThrow(TypeError);
  });

  it('produces the same hash for equivalent objects independent of key order', () => {
    const metadata = {
      sourceType: 'Agreement',
      sourceId: 'agreement-1',
      version: 4,
      createdAt: new Date('2026-11-14T00:00:00.000Z'),
    };
    const first = createVersionedSnapshot(metadata, {
      terms: { amount: '1000000', asset: 'NEAR' },
      parties: ['funder', 'recipient'],
    });
    const second = createVersionedSnapshot(metadata, {
      parties: ['funder', 'recipient'],
      terms: { asset: 'NEAR', amount: '1000000' },
    });

    expect(first.canonicalContent).toBe(second.canonicalContent);
    expect(first.contentHash).toBe(second.contentHash);
  });

  it('domain separates hashes by identity and version', () => {
    const content: SnapshotValue = { value: 'unchanged' };
    const snapshot = createVersionedSnapshot(
      { sourceType: 'Project', sourceId: 'one', version: 1 },
      content,
    );
    const changedSource = createVersionedSnapshot(
      { sourceType: 'Call', sourceId: 'one', version: 1 },
      content,
    );
    const changedVersion = createVersionedSnapshot(
      { sourceType: 'Project', sourceId: 'one', version: 2 },
      content,
    );

    expect(snapshot.contentHash).not.toBe(changedSource.contentHash);
    expect(snapshot.contentHash).not.toBe(changedVersion.contentHash);
  });

  it.each([
    ['empty source type', { sourceType: ' ', sourceId: 'id', version: 1 }],
    ['empty source ID', { sourceType: 'Project', sourceId: '', version: 1 }],
    ['zero version', { sourceType: 'Project', sourceId: 'id', version: 0 }],
    ['invalid date', {
      sourceType: 'Project',
      sourceId: 'id',
      version: 1,
      createdAt: new Date('invalid'),
    }],
  ])('rejects invalid metadata: %s', (_label, identity) => {
    expect(() =>
      createVersionedSnapshot(identity, { value: 'payload' }),
    ).toThrow();
  });

  it('rejects undefined, non-finite and circular content', () => {
    expect(() =>
      createVersionedSnapshot(
        { sourceType: 'Project', sourceId: 'id', version: 1 },
        { value: Number.NaN },
      ),
    ).toThrow('Snapshot numbers must be finite');
    expect(() =>
      createVersionedSnapshot(
        { sourceType: 'Project', sourceId: 'id', version: 1 },
        { value: undefined } as never,
      ),
    ).toThrow('undefined values');
    const circular: Record<string, SnapshotValue> = {};
    circular.self = circular;
    expect(() =>
      createVersionedSnapshot(
        { sourceType: 'Project', sourceId: 'id', version: 1 },
        circular,
      ),
    ).toThrow('circular references');
  });
});
