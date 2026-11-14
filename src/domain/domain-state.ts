export const DomainWorkflow = {
  Publication: 'Publication',
  Application: 'Application',
  FundingOffer: 'FundingOffer',
  Award: 'Award',
  Agreement: 'Agreement',
  Milestone: 'Milestone',
  FinanceOperation: 'FinanceOperation',
  Verification: 'Verification',
} as const;

export type DomainWorkflow =
  (typeof DomainWorkflow)[keyof typeof DomainWorkflow];

export const DomainState = {
  Draft: 'Draft',
  Published: 'Published',
  Active: 'Active',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
  Archived: 'Archived',
  Submitted: 'Submitted',
  UnderReview: 'UnderReview',
  Shortlisted: 'Shortlisted',
  Rejected: 'Rejected',
  Withdrawn: 'Withdrawn',
  Selected: 'Selected',
  Awarded: 'Awarded',
  NeedsInformation: 'NeedsInformation',
  Proposed: 'Proposed',
  Offered: 'Offered',
  Accepted: 'Accepted',
  Declined: 'Declined',
  Expired: 'Expired',
  AgreementPending: 'AgreementPending',
  AgreementCreated: 'AgreementCreated',
  PendingAcceptance: 'PendingAcceptance',
  AwaitingFunding: 'AwaitingFunding',
  PartiallyFunded: 'PartiallyFunded',
  Funded: 'Funded',
  Disputed: 'Disputed',
  Pending: 'Pending',
  Ready: 'Ready',
  Approved: 'Approved',
  ReleasePending: 'ReleasePending',
  Paid: 'Paid',
  ChangesRequested: 'ChangesRequested',
  Resubmitted: 'Resubmitted',
  Prepared: 'Prepared',
  AwaitingSignature: 'AwaitingSignature',
  ChainPending: 'ChainPending',
  Confirmed: 'Confirmed',
  Failed: 'Failed',
  Reverted: 'Reverted',
  Unknown: 'Unknown',
  NotStarted: 'NotStarted',
  NeedsInfo: 'NeedsInfo',
  Verified: 'Verified',
  Revoked: 'Revoked',
} as const;

export type DomainState = (typeof DomainState)[keyof typeof DomainState];

export const IntakeStatus = {
  Open: 'Open',
  Paused: 'Paused',
  Closed: 'Closed',
} as const;

export type IntakeStatus =
  (typeof IntakeStatus)[keyof typeof IntakeStatus];

export const Visibility = {
  Private: 'Private',
  Unlisted: 'Unlisted',
  Public: 'Public',
} as const;

export type Visibility = (typeof Visibility)[keyof typeof Visibility];

export const domainTransitions: Record<
  DomainWorkflow,
  Partial<Record<DomainState, readonly DomainState[]>>
> = {
  [DomainWorkflow.Publication]: {
    [DomainState.Draft]: [DomainState.Published, DomainState.Cancelled],
    [DomainState.Published]: [DomainState.Active, DomainState.Cancelled],
    [DomainState.Active]: [
      DomainState.Completed,
      DomainState.Cancelled,
      DomainState.Archived,
    ],
    [DomainState.Completed]: [DomainState.Archived],
    [DomainState.Cancelled]: [DomainState.Archived],
  },
  [DomainWorkflow.Application]: {
    [DomainState.Draft]: [DomainState.Submitted, DomainState.Withdrawn],
    [DomainState.Submitted]: [
      DomainState.UnderReview,
      DomainState.Withdrawn,
      DomainState.NeedsInformation,
    ],
    [DomainState.UnderReview]: [
      DomainState.Shortlisted,
      DomainState.Rejected,
      DomainState.Withdrawn,
      DomainState.NeedsInformation,
    ],
    [DomainState.NeedsInformation]: [
      DomainState.Submitted,
      DomainState.Withdrawn,
    ],
    [DomainState.Shortlisted]: [
      DomainState.Selected,
      DomainState.Rejected,
      DomainState.Withdrawn,
    ],
    [DomainState.Selected]: [DomainState.Awarded, DomainState.Rejected],
  },
  [DomainWorkflow.FundingOffer]: {
    [DomainState.Draft]: [DomainState.Submitted, DomainState.Withdrawn],
    [DomainState.Submitted]: [
      DomainState.UnderReview,
      DomainState.Withdrawn,
    ],
    [DomainState.UnderReview]: [
      DomainState.Accepted,
      DomainState.Declined,
      DomainState.NeedsInformation,
    ],
    [DomainState.NeedsInformation]: [DomainState.Submitted],
    [DomainState.Accepted]: [DomainState.Awarded],
  },
  [DomainWorkflow.Award]: {
    [DomainState.Proposed]: [DomainState.Offered, DomainState.Expired],
    [DomainState.Offered]: [
      DomainState.Accepted,
      DomainState.Declined,
      DomainState.Expired,
    ],
    [DomainState.Accepted]: [
      DomainState.AgreementPending,
      DomainState.Expired,
    ],
    [DomainState.AgreementPending]: [DomainState.AgreementCreated],
  },
  [DomainWorkflow.Agreement]: {
    [DomainState.Draft]: [DomainState.PendingAcceptance, DomainState.Cancelled],
    [DomainState.PendingAcceptance]: [
      DomainState.Accepted,
      DomainState.Cancelled,
      DomainState.Expired,
    ],
    [DomainState.Accepted]: [
      DomainState.AwaitingFunding,
      DomainState.Cancelled,
      DomainState.Disputed,
    ],
    [DomainState.AwaitingFunding]: [
      DomainState.PartiallyFunded,
      DomainState.Funded,
      DomainState.Cancelled,
      DomainState.Disputed,
      DomainState.Expired,
    ],
    [DomainState.PartiallyFunded]: [
      DomainState.Funded,
      DomainState.Cancelled,
      DomainState.Disputed,
    ],
    [DomainState.Funded]: [
      DomainState.Active,
      DomainState.Cancelled,
      DomainState.Disputed,
    ],
    [DomainState.Active]: [
      DomainState.Completed,
      DomainState.Cancelled,
      DomainState.Disputed,
    ],
    [DomainState.Disputed]: [DomainState.Active, DomainState.Completed],
  },
  [DomainWorkflow.Milestone]: {
    [DomainState.Pending]: [DomainState.Ready],
    [DomainState.Ready]: [DomainState.Submitted],
    [DomainState.Submitted]: [
      DomainState.UnderReview,
      DomainState.Disputed,
    ],
    [DomainState.UnderReview]: [
      DomainState.Approved,
      DomainState.ChangesRequested,
      DomainState.Rejected,
      DomainState.Disputed,
    ],
    [DomainState.ChangesRequested]: [DomainState.Resubmitted],
    [DomainState.Resubmitted]: [DomainState.UnderReview],
    [DomainState.Approved]: [DomainState.ReleasePending, DomainState.Disputed],
    [DomainState.ReleasePending]: [DomainState.Paid, DomainState.Disputed],
  },
  [DomainWorkflow.FinanceOperation]: {
    [DomainState.Prepared]: [
      DomainState.AwaitingSignature,
      DomainState.Failed,
    ],
    [DomainState.AwaitingSignature]: [
      DomainState.Submitted,
      DomainState.Failed,
    ],
    [DomainState.Submitted]: [
      DomainState.ChainPending,
      DomainState.Failed,
      DomainState.Unknown,
    ],
    [DomainState.ChainPending]: [
      DomainState.Confirmed,
      DomainState.Failed,
      DomainState.Reverted,
      DomainState.Unknown,
    ],
    [DomainState.Unknown]: [
      DomainState.ChainPending,
      DomainState.Confirmed,
      DomainState.Failed,
      DomainState.Reverted,
    ],
  },
  [DomainWorkflow.Verification]: {
    [DomainState.NotStarted]: [DomainState.Pending],
    [DomainState.Pending]: [
      DomainState.NeedsInfo,
      DomainState.Verified,
      DomainState.Rejected,
    ],
    [DomainState.NeedsInfo]: [DomainState.Pending, DomainState.Rejected],
    [DomainState.Verified]: [DomainState.Expired, DomainState.Revoked],
    [DomainState.Expired]: [DomainState.Pending, DomainState.Revoked],
  },
};

export type TransitionContext = {
  actorId: string;
  correlationId: string;
  causationId?: string;
  occurredAt?: Date;
};

export type DomainTransitionEvent = TransitionContext & {
  eventName: 'DomainStateTransitioned';
  workflow: DomainWorkflow;
  fromState: DomainState;
  toState: DomainState;
};

export class InvalidDomainTransitionError extends Error {
  constructor(
    readonly workflow: DomainWorkflow,
    readonly fromState: DomainState,
    readonly toState: DomainState,
  ) {
    super(`Invalid ${workflow} transition: ${fromState} -> ${toState}`);
    this.name = 'InvalidDomainTransitionError';
  }
}

export function transitionDomainState(
  workflow: DomainWorkflow,
  fromState: DomainState,
  toState: DomainState,
  context: TransitionContext,
): DomainTransitionEvent {
  if (!context.actorId || !context.correlationId) {
    throw new TypeError('actorId and correlationId are required');
  }

  if (!domainTransitions[workflow][fromState]?.includes(toState)) {
    throw new InvalidDomainTransitionError(workflow, fromState, toState);
  }

  return {
    eventName: 'DomainStateTransitioned',
    workflow,
    fromState,
    toState,
    ...context,
    occurredAt: context.occurredAt ?? new Date(),
  };
}
