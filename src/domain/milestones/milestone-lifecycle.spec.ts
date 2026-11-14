import {
  transitionMilestone,
  validateEvidenceVersion,
  validateMilestoneVersion,
} from './milestone-lifecycle.js';

describe('milestone lifecycle', () => {
  it('keeps approval separate from payment', () => {
    expect(transitionMilestone('UnderReview', 'Approved')).toBe('Approved');
    expect(() => transitionMilestone('Approved', 'Paid')).toThrow();
    expect(transitionMilestone('ReleasePending', 'Paid')).toBe('Paid');
  });

  it('rejects skipped or invalid milestone versions and amounts', () => {
    expect(() =>
      validateMilestoneVersion({
        version: 3,
        previousVersion: 1,
        sequence: 1,
        amount: '20',
        dueAt: null,
        acceptanceCriteria: { checks: ['demo'] },
      }),
    ).toThrow(/increase by exactly one/);
    expect(() =>
      validateMilestoneVersion({
        version: 1,
        sequence: 1,
        amount: '1.5',
        dueAt: null,
        acceptanceCriteria: { checks: [] },
      }),
    ).toThrow(/base-unit integer/);
  });

  it('requires consecutive private evidence versions and valid metadata', () => {
    const evidence = {
      version: 2,
      previousVersion: 1,
      storageKey: 'evidence/award-123/object-456',
      checksumSha256: 'a'.repeat(64),
      mimeType: 'application/pdf',
      sizeBytes: 184320,
    };
    expect(() => validateEvidenceVersion(evidence)).not.toThrow();
    expect(() =>
      validateEvidenceVersion({ ...evidence, visibility: 'Public' as never }),
    ).toThrow(/remain private/);
    expect(() => validateEvidenceVersion({ ...evidence, version: 4 })).toThrow(
      /increase by exactly one/,
    );
  });
});
