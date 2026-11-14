import {
  FundingDirection,
  PublicationLifecycle,
  PublicationSourceType,
  PublicationVisibility,
  SubmissionType,
  type PublicationSnapshot,
} from './publication.types.js';
import {
  assertSubmissionDirection,
  mayAcceptFundingAmount,
  shouldCloseIntakeAfterFunding,
  validatePublication,
} from './publication.validation.js';

describe('publication validation', () => {
  const project: PublicationSnapshot = {
    sourceType: PublicationSourceType.Project,
    ownerUserId: 'user-1',
    title: 'Solar hub',
    description: 'A community solar installation',
    direction: FundingDirection.FundingRequested,
    visibility: PublicationVisibility.Public,
    lifecycleStatus: PublicationLifecycle.Draft,
    intakeStatus: 'Open',
    hardCapEnabled: false,
    objectives: ['Install solar panels'],
  };

  it('accepts Applications only for FundingOffered and FundingOffers only for FundingRequested', () => {
    expect(() =>
      assertSubmissionDirection(
        FundingDirection.FundingOffered,
        SubmissionType.Application,
      ),
    ).not.toThrow();
    expect(() =>
      assertSubmissionDirection(
        FundingDirection.FundingRequested,
        SubmissionType.FundingOffer,
      ),
    ).not.toThrow();
    expect(() =>
      assertSubmissionDirection(
        FundingDirection.FundingOffered,
        SubmissionType.FundingOffer,
      ),
    ).toThrow();
    expect(() =>
      assertSubmissionDirection(
        FundingDirection.FundingRequested,
        SubmissionType.Application,
      ),
    ).toThrow();
  });

  it('requires a valid hard cap only when the explicit hard-cap policy is enabled', () => {
    expect(() =>
      validatePublication(
        {
          ...project,
          fundingTargetAmount: '100',
          targetAsset: 'NEAR',
          hardCapEnabled: false,
        },
        'Project',
      ),
    ).not.toThrow();
    expect(() =>
      validatePublication({ ...project, hardCapEnabled: true }, 'Project'),
    ).toThrow('An enabled hard cap requires a positive integer amount');
    expect(() =>
      validatePublication(
        {
          ...project,
          hardCapEnabled: true,
          hardCapAmount: '200',
          targetAsset: 'NEAR',
        },
        'Project',
      ),
    ).not.toThrow();
  });

  it('treats the target as informational and independently enforces a hard cap', () => {
    expect(mayAcceptFundingAmount(false, undefined, '1000', '1')).toBe(true);
    expect(mayAcceptFundingAmount(true, '100', '90', '10')).toBe(true);
    expect(mayAcceptFundingAmount(true, '100', '90', '11')).toBe(false);
    expect(() =>
      validatePublication(
        {
          ...project,
          fundingTargetAmount: '101',
          targetAsset: 'NEAR',
          hardCapEnabled: true,
          hardCapAmount: '100',
        },
        'Project',
      ),
    ).toThrow('Funding target cannot exceed the enabled hard cap');
  });

  it('closes intake at a reached cap only when the publisher opted in', () => {
    expect(shouldCloseIntakeAfterFunding(true, false, '100', '100')).toBe(
      false,
    );
    expect(shouldCloseIntakeAfterFunding(false, true, '100', '100')).toBe(
      false,
    );
    expect(shouldCloseIntakeAfterFunding(true, true, '100', '99')).toBe(false);
    expect(shouldCloseIntakeAfterFunding(true, true, '100', '100')).toBe(true);
  });

  it('rejects empty Call audiences and inconsistent quotas or budgets', () => {
    const call = {
      ...project,
      sourceType: PublicationSourceType.Call,
      direction: FundingDirection.FundingOffered,
      audienceTypes: ['Community'],
      supportTypes: ['Grant'],
    } as PublicationSnapshot;
    expect(() =>
      validatePublication({ ...call, audienceTypes: [] }, 'Call'),
    ).toThrow('A Call requires a non-empty audience');
    expect(() =>
      validatePublication({ ...call, maximumAwards: 0 }, 'Call'),
    ).toThrow('Maximum awards must be a positive integer');
    expect(() =>
      validatePublication(
        {
          ...call,
          maximumAwards: 3,
          fixedAwardAmount: '40',
          overallBudget: '100',
        },
        'Call',
      ),
    ).toThrow('Fixed awards exceed the overall budget');
  });

  it('rejects contradictory audience, award quota, and selection dates during publication validation', () => {
    const call = {
      ...project,
      sourceType: PublicationSourceType.Call,
      direction: FundingDirection.FundingOffered,
      audienceTypes: ['Community'],
      supportTypes: ['Grant'],
      maximumAwards: 3,
      intakeOpensAt: '2026-12-01T00:00:00.000Z',
      intakeClosesAt: '2027-01-01T00:00:00.000Z',
    } as PublicationSnapshot;
    expect(() =>
      validatePublication(
        { ...call, eligibilityRule: { audienceTypes: ['Company'] } },
        'Call',
      ),
    ).toThrow('Eligibility audiences must be included');
    expect(() =>
      validatePublication(
        { ...call, opportunityPolicy: { maxAwards: 2 } },
        'Call',
      ),
    ).toThrow('must match the Call maximum awards');
    expect(() =>
      validatePublication(
        {
          ...call,
          opportunityPolicy: {
            selectionWindowOpensAt: '2027-01-01T00:00:00.000Z',
            selectionWindowClosesAt: '2027-01-02T00:00:00.000Z',
          },
        },
        'Call',
      ),
    ).toThrow('Selection cannot close after intake closes');
    expect(() =>
      validatePublication(
        {
          ...call,
          eligibilityRule: {
            audienceTypes: ['Community'],
            allowedJurisdictions: ['BO'],
            excludedJurisdictions: ['BO'],
          },
        },
        'Call',
      ),
    ).toThrow('cannot be both allowed and excluded');
  });
});
