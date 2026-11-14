import { eligibilityConfigurationSchema } from './eligibility-admin.dto.js';

describe('eligibility configuration schema', () => {
  const valid = {
    eligibilityRule: {
      audienceTypes: ['Nonprofit'],
      allowedJurisdictions: ['BO'],
      excludedJurisdictions: ['US'],
      verificationLevel: 'Enhanced',
    },
    questionnaire: {
      questions: [
        {
          id: 'impact',
          kind: 'LongText',
          label: 'Describe the impact',
          required: true,
          displayOrder: 0,
        },
      ],
    },
    opportunityPolicy: {
      maxApplicationsPerApplicant: 1,
      maxAwards: 2,
      selectionWindowOpensAt: '2026-12-01T00:00:00.000Z',
      selectionWindowClosesAt: '2027-01-01T00:00:00.000Z',
    },
  };

  it('accepts complete audience, jurisdiction, verification, quota, date, and question configuration', () => {
    expect(eligibilityConfigurationSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects unknown fields, duplicate order, and choice questions without options', () => {
    expect(
      eligibilityConfigurationSchema.safeParse({ ...valid, extra: true })
        .success,
    ).toBe(false);
    expect(
      eligibilityConfigurationSchema.safeParse({
        ...valid,
        questionnaire: {
          questions: [
            valid.questionnaire.questions[0],
            { ...valid.questionnaire.questions[0], id: 'other' },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      eligibilityConfigurationSchema.safeParse({
        ...valid,
        questionnaire: {
          questions: [
            { ...valid.questionnaire.questions[0], kind: 'SingleChoice' },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it('rejects contradictory jurisdictions and date windows', () => {
    expect(
      eligibilityConfigurationSchema.safeParse({
        ...valid,
        eligibilityRule: {
          ...valid.eligibilityRule,
          excludedJurisdictions: ['BO'],
        },
      }).success,
    ).toBe(false);
    expect(
      eligibilityConfigurationSchema.safeParse({
        ...valid,
        opportunityPolicy: {
          selectionWindowOpensAt: '2027-01-02T00:00:00.000Z',
          selectionWindowClosesAt: '2027-01-01T00:00:00.000Z',
        },
      }).success,
    ).toBe(false);
  });

  it('accepts only verification levels supported by deterministic eligibility evaluation', () => {
    expect(
      eligibilityConfigurationSchema.safeParse({
        ...valid,
        eligibilityRule: {
          ...valid.eligibilityRule,
          verificationLevel: 'ExternalProviderOnly',
        },
      }).success,
    ).toBe(false);
  });
});
