import { describe, expect, it } from 'vitest';
import {
  EligibilityFinding,
  evaluateEligibility,
  type EligibilityProfile,
} from './eligibility.js';

const rule = {
  audienceTypes: ['Nonprofit'],
  allowedJurisdictions: ['BO', 'PE'],
  excludedJurisdictions: ['PE'],
  verificationLevel: 'Enhanced',
  minRequirements: { yearsOperating: 3, registered: true },
};

const completeProfile: EligibilityProfile = {
  applicantType: 'Nonprofit',
  jurisdiction: 'BO',
  verificationStatus: 'Verified',
  verificationLevel: 'Full',
  requirements: { yearsOperating: 4, registered: true },
};

describe('evaluateEligibility', () => {
  it('returns Eligible when every deterministic rule passes', () => {
    expect(
      evaluateEligibility({
        rule,
        profile: completeProfile,
        ruleVersion: '7',
        evaluatedAt: new Date('2026-01-01T00:00:00Z'),
      }),
    ).toMatchObject({ result: EligibilityFinding.Eligible, reasons: [] });
  });

  it('prioritizes disqualifying requirements as Ineligible', () => {
    const result = evaluateEligibility({
      rule,
      profile: { ...completeProfile, jurisdiction: 'PE' },
      ruleVersion: '7',
    });

    expect(result.result).toBe(EligibilityFinding.Ineligible);
    expect(result.reasons).toContainEqual(
      expect.objectContaining({ code: 'JurisdictionExcluded' }),
    );
  });

  it('returns MissingInformation when required profile fields or answers are absent', () => {
    const result = evaluateEligibility({
      rule,
      profile: { applicantType: 'Nonprofit' },
      questions: [
        {
          id: 'project-summary',
          kind: 'LongText',
          label: 'Project summary',
          required: true,
          displayOrder: 1,
        },
      ],
      answers: {},
      ruleVersion: '7',
    });

    expect(result.result).toBe(EligibilityFinding.MissingInformation);
    expect(result.reasons.map(({ code }) => code)).toContain(
      'RequiredAnswerMissing',
    );
  });

  it('returns NeedsReview for pending verification', () => {
    const result = evaluateEligibility({
      rule,
      profile: { ...completeProfile, verificationStatus: 'Pending' },
      ruleVersion: '7',
    });

    expect(result.result).toBe(EligibilityFinding.NeedsReview);
  });

  it('hashes the exact rule and inputs deterministically', () => {
    const first = evaluateEligibility({
      rule,
      profile: completeProfile,
      ruleVersion: '7',
      evaluatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const repeated = evaluateEligibility({
      rule: { ...rule, minRequirements: { registered: true, yearsOperating: 3 } },
      profile: completeProfile,
      ruleVersion: '7',
      evaluatedAt: new Date('2026-02-01T00:00:00Z'),
    });

    expect(first.inputHash).toBe(repeated.inputHash);
    expect(first.inputHash).toHaveLength(64);
  });

  it('rejects unsupported configured verification levels', () => {
    expect(() =>
      evaluateEligibility({
        rule: { audienceTypes: [], verificationLevel: 'Gold' },
        profile: completeProfile,
        ruleVersion: '7',
      }),
    ).toThrow('Eligibility verification level is unsupported');
  });

  it('rejects non-JSON input instead of producing an unstable hash', () => {
    expect(() =>
      evaluateEligibility({
        rule: { audienceTypes: [] },
        profile: { applicantType: 'Nonprofit', requirements: { years: Number.NaN } },
        ruleVersion: '1',
      }),
    ).toThrow('Eligibility inputs must contain finite numbers');

    const answers: Record<string, unknown> = {};
    answers.circular = answers;
    expect(() =>
      evaluateEligibility({
        rule: { audienceTypes: [] },
        profile: { applicantType: 'Nonprofit' },
        answers,
        ruleVersion: '1',
      }),
    ).toThrow('Eligibility inputs cannot contain circular references');
  });
});
