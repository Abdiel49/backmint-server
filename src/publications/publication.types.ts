export const PublicationSourceType = {
  Project: 'Project',
  Call: 'Call',
} as const;

export type PublicationSourceType =
  (typeof PublicationSourceType)[keyof typeof PublicationSourceType];

export const FundingDirection = {
  FundingOffered: 'FundingOffered',
  FundingRequested: 'FundingRequested',
} as const;

export type FundingDirection =
  (typeof FundingDirection)[keyof typeof FundingDirection];

export const PublicationLifecycle = {
  Draft: 'Draft',
  Published: 'Published',
  Active: 'Active',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
  Archived: 'Archived',
} as const;

export type PublicationLifecycle =
  (typeof PublicationLifecycle)[keyof typeof PublicationLifecycle];

export const PublicationVisibility = {
  Private: 'Private',
  Unlisted: 'Unlisted',
  Public: 'Public',
} as const;

export type PublicationVisibility =
  (typeof PublicationVisibility)[keyof typeof PublicationVisibility];

export const PublicationIntake = {
  Open: 'Open',
  Paused: 'Paused',
  Closed: 'Closed',
} as const;

export type PublicationIntake =
  (typeof PublicationIntake)[keyof typeof PublicationIntake];

export const SubmissionType = {
  Application: 'Application',
  FundingOffer: 'FundingOffer',
} as const;

export type SubmissionType =
  (typeof SubmissionType)[keyof typeof SubmissionType];

export type QuestionnaireQuestion = {
  id: string;
  kind:
    | 'Text'
    | 'LongText'
    | 'Number'
    | 'SingleChoice'
    | 'MultipleChoice'
    | 'Boolean';
  label: string;
  required: boolean;
  options?: string[];
  validation?: Record<string, string | number | boolean>;
  displayOrder: number;
};

export type EligibilityRuleDefinition = {
  audienceTypes: string[];
  allowedJurisdictions?: string[];
  excludedJurisdictions?: string[];
  verificationLevel?: string;
  minRequirements?: Record<string, string | number | boolean>;
};

export type OpportunityPolicyDefinition = {
  maxApplicationsPerApplicant?: number;
  allowReapply?: boolean;
  maxAwards?: number;
  selectionWindowOpensAt?: string;
  selectionWindowClosesAt?: string;
  closeIntakeWhenHardCapReached?: boolean;
  disclosurePolicy?: Record<string, string | boolean>;
};

export type PublicationSnapshot = {
  sourceType: PublicationSourceType;
  ownerUserId?: string;
  ownerOrganizationId?: string;
  title: string;
  description: string;
  direction: FundingDirection;
  visibility: PublicationVisibility;
  lifecycleStatus: PublicationLifecycle;
  intakeStatus: PublicationIntake;
  fundingTargetAmount?: string;
  targetAsset?: string;
  hardCapEnabled: boolean;
  hardCapAmount?: string;
  intakeOpensAt?: string;
  intakeClosesAt?: string;
  objectives?: string[];
  costs?: Array<{ name: string; amount: string; asset: string }>;
  deliverables?: string[];
  audienceTypes?: string[];
  maximumAwards?: number;
  allocationMode?: 'Single' | 'Multiple' | 'Limited';
  fixedAwardAmount?: string;
  overallBudget?: string;
  supportTypes?: string[];
  selectionMethod?: string;
  eligibilityRule?: EligibilityRuleDefinition;
  questionnaire?: { version: number; questions: QuestionnaireQuestion[] };
  opportunityPolicy?: OpportunityPolicyDefinition;
  publishedAt?: string;
};

export type CreateProjectInput = Omit<
  PublicationSnapshot,
  'sourceType' | 'lifecycleStatus' | 'intakeStatus' | 'hardCapEnabled'
> & {
  hardCapEnabled?: boolean;
};

export type CreateCallInput = Omit<
  PublicationSnapshot,
  'sourceType' | 'lifecycleStatus' | 'intakeStatus' | 'hardCapEnabled'
> & {
  hardCapEnabled?: boolean;
};

export type OpportunityView = {
  sourceType: PublicationSourceType;
  sourceId: string;
  title: string;
  description: string;
  direction: FundingDirection;
  visibility: PublicationVisibility;
  lifecycleStatus: PublicationLifecycle;
  intakeStatus: PublicationIntake;
  publishedAt: string;
  fundingTargetAmount?: string;
  targetAsset?: string;
  audienceTypes?: string[];
  supportTypes?: string[];
  intakeClosesAt?: string;
};
