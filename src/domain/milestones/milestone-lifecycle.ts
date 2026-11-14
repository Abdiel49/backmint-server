export const MilestoneStatus = {
  Pending: 'Pending',
  Ready: 'Ready',
  Submitted: 'Submitted',
  UnderReview: 'UnderReview',
  Approved: 'Approved',
  ReleasePending: 'ReleasePending',
  Paid: 'Paid',
  ChangesRequested: 'ChangesRequested',
  Resubmitted: 'Resubmitted',
  Rejected: 'Rejected',
  Disputed: 'Disputed',
} as const;

export type MilestoneStatus =
  (typeof MilestoneStatus)[keyof typeof MilestoneStatus];

const transitions: Record<MilestoneStatus, readonly MilestoneStatus[]> = {
  Pending: ['Ready', 'Disputed'],
  Ready: ['Submitted', 'Disputed'],
  Submitted: ['UnderReview', 'Disputed'],
  UnderReview: ['Approved', 'ChangesRequested', 'Rejected', 'Disputed'],
  Approved: ['ReleasePending', 'Disputed'],
  ReleasePending: ['Paid', 'Disputed'],
  Paid: [],
  ChangesRequested: ['Resubmitted', 'Disputed'],
  Resubmitted: ['UnderReview', 'Disputed'],
  Rejected: ['Disputed'],
  Disputed: [],
};

export function transitionMilestone(
  current: MilestoneStatus,
  next: MilestoneStatus,
): MilestoneStatus {
  if (!transitions[current].includes(next)) {
    throw new Error(
      `Milestone transition from ${current} to ${next} is invalid`,
    );
  }
  return next;
}

export function validateMilestoneVersion(input: {
  version: number;
  previousVersion?: number;
  sequence: number;
  amount: string;
  dueAt: Date | null;
  acceptanceCriteria: unknown;
}): void {
  if (
    !Number.isSafeInteger(input.version) ||
    input.version < 1 ||
    input.version !== (input.previousVersion ?? 0) + 1
  ) {
    throw new RangeError('Milestone version must increase by exactly one');
  }
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 1) {
    throw new RangeError('Milestone sequence must be a positive integer');
  }
  if (!/^(0|[1-9][0-9]*)$/.test(input.amount) || BigInt(input.amount) < 1n) {
    throw new RangeError(
      'Milestone amount must be a positive base-unit integer',
    );
  }
  if (input.dueAt && Number.isNaN(input.dueAt.getTime())) {
    throw new RangeError('Milestone due date is invalid');
  }
  if (
    !input.acceptanceCriteria ||
    typeof input.acceptanceCriteria !== 'object' ||
    Array.isArray(input.acceptanceCriteria)
  ) {
    throw new TypeError('Milestone acceptance criteria must be an object');
  }
}

export function validateEvidenceVersion(input: {
  version: number;
  previousVersion?: number;
  storageKey: string;
  checksumSha256: string;
  mimeType: string;
  sizeBytes: number;
  visibility?: 'Private';
}): void {
  if (
    !Number.isSafeInteger(input.version) ||
    input.version !== (input.previousVersion ?? 0) + 1
  ) {
    throw new RangeError('Evidence version must increase by exactly one');
  }
  if (
    !input.storageKey.trim() ||
    input.storageKey.startsWith('/') ||
    /^https?:\/\//i.test(input.storageKey) ||
    input.storageKey
      .split('/')
      .some((segment) => segment === '.' || segment === '..')
  ) {
    throw new TypeError(
      'Evidence storage key must be a private object reference',
    );
  }
  if (!/^[a-f0-9]{64}$/.test(input.checksumSha256)) {
    throw new TypeError(
      'Evidence checksum must be a lowercase SHA-256 hex digest',
    );
  }
  if (!/^[\w.+-]+\/[\w.+-]+$/.test(input.mimeType)) {
    throw new TypeError('Evidence MIME type is invalid');
  }
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1) {
    throw new RangeError('Evidence size must be a positive integer');
  }
  if (input.visibility !== undefined && input.visibility !== 'Private') {
    throw new TypeError('Evidence visibility must remain private');
  }
}
