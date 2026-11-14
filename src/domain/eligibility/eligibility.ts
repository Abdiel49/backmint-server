import { createHash } from 'node:crypto';
import type { EligibilityRuleDefinition, QuestionnaireQuestion } from '../../publications/publication.types.js';

export const EligibilityFinding = {
  Eligible: 'Eligible',
  NeedsReview: 'NeedsReview',
  Ineligible: 'Ineligible',
  MissingInformation: 'MissingInformation',
} as const;

export type EligibilityFinding =
  (typeof EligibilityFinding)[keyof typeof EligibilityFinding];

export type EligibilityProfile = {
  applicantType?: string;
  jurisdiction?: string;
  verificationLevel?: string;
  verificationStatus?:
    | 'NotStarted'
    | 'Pending'
    | 'NeedsInfo'
    | 'Verified'
    | 'Rejected'
    | 'Expired'
    | 'Revoked';
  requirements?: Record<string, string | number | boolean | undefined>;
};

export type EligibilityReason = {
  code: string;
  field: string;
  expected?: string | number | boolean;
  actual?: string | number | boolean;
};

export type EligibilityEvaluation = Readonly<{
  result: EligibilityFinding;
  reasons: readonly EligibilityReason[];
  inputHash: string;
  ruleVersion: string;
  evaluatedAt: string;
}>;

const verificationRanks: Record<string, number> = {
  Basic: 1,
  Enhanced: 2,
  Full: 3,
};

export function evaluateEligibility(input: {
  rule: EligibilityRuleDefinition;
  profile: EligibilityProfile;
  questions?: QuestionnaireQuestion[];
  answers?: Record<string, unknown>;
  ruleVersion: string;
  evaluatedAt?: Date;
}): EligibilityEvaluation {
  if (!input.ruleVersion.trim()) {
    throw new TypeError('ruleVersion is required');
  }
  validateRule(input.rule);
  const reasons: EligibilityReason[] = [];
  const profile = input.profile;

  if (!profile.applicantType?.trim()) {
    reasons.push({ code: 'ApplicantTypeMissing', field: 'applicantType' });
  } else if (
    input.rule.audienceTypes.length > 0 &&
    !input.rule.audienceTypes.includes(profile.applicantType)
  ) {
    reasons.push({
      code: 'AudienceNotAllowed',
      field: 'applicantType',
      expected: input.rule.audienceTypes.join(','),
      actual: profile.applicantType,
    });
  }

  if (
    input.rule.allowedJurisdictions?.length ||
    input.rule.excludedJurisdictions?.length
  ) {
    if (!profile.jurisdiction?.trim()) {
      reasons.push({ code: 'JurisdictionMissing', field: 'jurisdiction' });
    } else {
      const jurisdiction = profile.jurisdiction.toUpperCase();
      if (
        input.rule.excludedJurisdictions?.some(
          (item) => item.toUpperCase() === jurisdiction,
        )
      ) {
        reasons.push({
          code: 'JurisdictionExcluded',
          field: 'jurisdiction',
          actual: jurisdiction,
        });
      } else if (
        input.rule.allowedJurisdictions?.length &&
        !input.rule.allowedJurisdictions.some(
          (item) => item.toUpperCase() === jurisdiction,
        )
      ) {
        reasons.push({
          code: 'JurisdictionNotAllowed',
          field: 'jurisdiction',
          expected: input.rule.allowedJurisdictions.join(','),
          actual: jurisdiction,
        });
      }
    }
  }

  if (input.rule.verificationLevel) {
    evaluateVerification(input.rule.verificationLevel, profile, reasons);
  }

  for (const [field, expected] of Object.entries(input.rule.minRequirements ?? {})) {
    const actual = profile.requirements?.[field];
    if (actual === undefined) {
      reasons.push({ code: 'RequirementMissing', field, expected });
    } else if (!meetsRequirement(actual, expected)) {
      reasons.push({ code: 'RequirementNotMet', field, expected, actual });
    }
  }

  for (const question of input.questions ?? []) {
    if (question.required && isMissingAnswer(input.answers?.[question.id])) {
      reasons.push({
        code: 'RequiredAnswerMissing',
        field: `answers.${question.id}`,
      });
    }
  }

  const result = determineFinding(reasons);
  const hashInput = {
    rule: input.rule,
    profile,
    questions: input.questions ?? [],
    answers: input.answers ?? {},
    ruleVersion: input.ruleVersion,
  };

  return Object.freeze({
    result,
    reasons: Object.freeze(reasons.map((reason) => Object.freeze(reason))),
    inputHash: createHash('sha256')
      .update(canonicalJson(hashInput))
      .digest('hex'),
    ruleVersion: input.ruleVersion,
    evaluatedAt: dateToIso(input.evaluatedAt),
  });
}

function validateRule(rule: EligibilityRuleDefinition): void {
  if (!Array.isArray(rule.audienceTypes)) {
    throw new TypeError('Eligibility audienceTypes must be an array');
  }
  if (
    rule.verificationLevel &&
    verificationRanks[rule.verificationLevel] === undefined
  ) {
    throw new TypeError('Eligibility verification level is unsupported');
  }
}

function evaluateVerification(
  requiredLevel: string,
  profile: EligibilityProfile,
  reasons: EligibilityReason[],
): void {
  if (!profile.verificationStatus) {
    reasons.push({ code: 'VerificationStatusMissing', field: 'verificationStatus' });
    return;
  }
  if (['Rejected', 'Expired', 'Revoked'].includes(profile.verificationStatus)) {
    reasons.push({
      code: 'VerificationNotValid',
      field: 'verificationStatus',
      expected: 'Verified',
      actual: profile.verificationStatus,
    });
    return;
  }
  if (profile.verificationStatus !== 'Verified') {
    reasons.push({
      code: 'VerificationNeedsReview',
      field: 'verificationStatus',
      expected: 'Verified',
      actual: profile.verificationStatus,
    });
    return;
  }
  if (!profile.verificationLevel) {
    reasons.push({ code: 'VerificationLevelMissing', field: 'verificationLevel' });
    return;
  }
  if (verificationRanks[profile.verificationLevel] === undefined) {
    reasons.push({ code: 'VerificationLevelUnknown', field: 'verificationLevel' });
    return;
  }
  if (
    verificationRanks[profile.verificationLevel] <
    verificationRanks[requiredLevel]
  ) {
    reasons.push({
      code: 'VerificationLevelInsufficient',
      field: 'verificationLevel',
      expected: requiredLevel,
      actual: profile.verificationLevel,
    });
  }
}

function meetsRequirement(
  actual: string | number | boolean,
  expected: string | number | boolean,
): boolean {
  if (typeof actual !== typeof expected) {
    return false;
  }
  if (typeof actual === 'number' && typeof expected === 'number') {
    return actual >= expected;
  }
  return actual === expected;
}

function isMissingAnswer(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0)
  );
}

function determineFinding(reasons: EligibilityReason[]): EligibilityFinding {
  if (
    reasons.some((reason) =>
      ['AudienceNotAllowed', 'JurisdictionExcluded', 'JurisdictionNotAllowed', 'RequirementNotMet', 'VerificationNotValid', 'VerificationLevelInsufficient'].includes(reason.code),
    )
  ) {
    return EligibilityFinding.Ineligible;
  }
  if (reasons.some((reason) => reason.code.endsWith('Missing'))) {
    return EligibilityFinding.MissingInformation;
  }
  if (
    reasons.some((reason) =>
      ['VerificationNeedsReview', 'VerificationLevelUnknown'].includes(reason.code),
    )
  ) {
    return EligibilityFinding.NeedsReview;
  }
  return EligibilityFinding.Eligible;
}

function canonicalJson(value: unknown, ancestors = new Set<object>()): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new TypeError('Eligibility inputs must contain finite numbers');
    }
    if (
      value === undefined ||
      typeof value === 'function' ||
      typeof value === 'symbol' ||
      typeof value === 'bigint'
    ) {
      throw new TypeError('Eligibility inputs must be JSON serializable');
    }
    return JSON.stringify(value);
  }
  if (ancestors.has(value)) {
    throw new TypeError('Eligibility inputs cannot contain circular references');
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    const serialized = `[${value
      .map((item) => canonicalJson(item, ancestors))
      .join(',')}]`;
    ancestors.delete(value);
    return serialized;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Eligibility inputs must use plain JSON objects');
  }
  const serialized = `{${Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item, ancestors)}`)
    .join(',')}}`;
  ancestors.delete(value);
  return serialized;
}

function dateToIso(date?: Date): string {
  const evaluatedAt = date ?? new Date();
  if (Number.isNaN(evaluatedAt.getTime())) {
    throw new TypeError('Eligibility evaluation timestamp is invalid');
  }
  return evaluatedAt.toISOString();
}
