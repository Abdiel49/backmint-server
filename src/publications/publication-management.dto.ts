import { z } from 'zod';
import {
  FundingDirection,
  PublicationIntake,
  PublicationLifecycle,
  PublicationVisibility,
} from './publication.types.js';

const questionSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum([
    'Text',
    'LongText',
    'Number',
    'SingleChoice',
    'MultipleChoice',
    'Boolean',
  ]),
  label: z.string().trim().min(1).max(500),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  validation: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  displayOrder: z.number().int().nonnegative(),
});

const eligibilityRuleSchema = z.strictObject({
  audienceTypes: z.array(z.string().trim().min(1).max(80)).min(1).max(50),
  allowedJurisdictions: z.array(z.string().trim().min(1).max(80)).max(250).optional(),
  excludedJurisdictions: z.array(z.string().trim().min(1).max(80)).max(250).optional(),
  verificationLevel: z.string().trim().min(1).max(80).optional(),
  minRequirements: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

const opportunityPolicySchema = z.strictObject({
  maxApplicationsPerApplicant: z.number().int().positive().optional(),
  allowReapply: z.boolean().optional(),
  maxAwards: z.number().int().positive().optional(),
  selectionWindowOpensAt: z.iso.datetime().optional(),
  selectionWindowClosesAt: z.iso.datetime().optional(),
  closeIntakeWhenHardCapReached: z.boolean().optional(),
  disclosurePolicy: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
});

const commonPublicationFields = {
  ownerOrganizationId: z.uuid().optional(),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().min(1).max(10000),
  direction: z.enum([FundingDirection.FundingOffered, FundingDirection.FundingRequested]),
  visibility: z.enum([PublicationVisibility.Private, PublicationVisibility.Unlisted, PublicationVisibility.Public]),
  fundingTargetAmount: z.string().regex(/^\d+$/).optional(),
  targetAsset: z.string().trim().min(1).max(128).optional(),
  hardCapEnabled: z.boolean().optional(),
  hardCapAmount: z.string().regex(/^\d+$/).optional(),
  intakeOpensAt: z.iso.datetime().optional(),
  intakeClosesAt: z.iso.datetime().optional(),
  eligibilityRule: eligibilityRuleSchema.optional(),
  questionnaire: z.strictObject({
    version: z.number().int().positive(),
    questions: z.array(questionSchema).max(200),
  }).optional(),
  opportunityPolicy: opportunityPolicySchema.optional(),
};

export const createProjectSchema = z.strictObject({
  ...commonPublicationFields,
  objectives: z.array(z.string().trim().min(1).max(2000)).min(1).max(100),
  costs: z.array(z.strictObject({
    name: z.string().trim().min(1).max(240),
    amount: z.string().regex(/^\d+$/),
    asset: z.string().trim().min(1).max(128),
  })).max(200).optional(),
  deliverables: z.array(z.string().trim().min(1).max(2000)).max(100).optional(),
});

export const createCallSchema = z.strictObject({
  ...commonPublicationFields,
  audienceTypes: z.array(z.string().trim().min(1).max(80)).min(1).max(50),
  maximumAwards: z.number().int().positive().optional(),
  allocationMode: z.enum(['Single', 'Multiple', 'Limited']).optional(),
  fixedAwardAmount: z.string().regex(/^\d+$/).optional(),
  overallBudget: z.string().regex(/^\d+$/).optional(),
  supportTypes: z.array(z.string().trim().min(1).max(80)).min(1).max(50),
  selectionMethod: z.string().trim().min(1).max(120).optional(),
});

export const updateProjectSchema = createProjectSchema.partial().omit({ ownerOrganizationId: true });
export const updateCallSchema = createCallSchema.partial().omit({ ownerOrganizationId: true });

export const setVisibilitySchema = z.strictObject({
  visibility: z.enum([PublicationVisibility.Private, PublicationVisibility.Unlisted, PublicationVisibility.Public]),
});

export const setIntakeSchema = z.strictObject({
  intakeStatus: z.enum([PublicationIntake.Open, PublicationIntake.Paused, PublicationIntake.Closed]),
});

export const transitionLifecycleSchema = z.strictObject({
  lifecycleStatus: z.enum([PublicationLifecycle.Draft, PublicationLifecycle.Published, PublicationLifecycle.Active, PublicationLifecycle.Completed, PublicationLifecycle.Cancelled, PublicationLifecycle.Archived]),
});

export type CreateProjectRequest = z.infer<typeof createProjectSchema>;
export type CreateCallRequest = z.infer<typeof createCallSchema>;
