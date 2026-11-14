import { z } from 'zod';
import { PublicationSourceType } from './publication.types.js';

const questionSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
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
    options: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    validation: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional(),
    displayOrder: z.number().int().min(0).max(10000),
  })
  .strict()
  .superRefine((question, context) => {
    if (
      ['SingleChoice', 'MultipleChoice'].includes(question.kind) &&
      (!question.options?.length ||
        new Set(question.options).size !== question.options.length)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Choice questions require unique options',
        path: ['options'],
      });
    }
  });

export const eligibilityConfigurationSchema = z
  .object({
    eligibilityRule: z
      .object({
        audienceTypes: z
          .array(z.string().trim().min(1).max(80))
          .min(1)
          .max(100),
        allowedJurisdictions: z
          .array(z.string().trim().min(2).max(3))
          .max(300)
          .optional(),
        excludedJurisdictions: z
          .array(z.string().trim().min(2).max(3))
          .max(300)
          .optional(),
        verificationLevel: z.enum(['Basic', 'Enhanced', 'Full']).optional(),
        minRequirements: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .optional(),
      })
      .strict(),
    questionnaire: z
      .object({
        questions: z.array(questionSchema).max(200),
      })
      .strict(),
    opportunityPolicy: z
      .object({
        maxApplicationsPerApplicant: z
          .number()
          .int()
          .min(1)
          .max(100000)
          .optional(),
        allowReapply: z.boolean().optional(),
        maxAwards: z.number().int().min(1).max(100000).optional(),
        selectionWindowOpensAt: z.string().datetime().optional(),
        selectionWindowClosesAt: z.string().datetime().optional(),
        closeIntakeWhenHardCapReached: z.boolean().optional(),
        disclosurePolicy: z
          .record(z.string(), z.union([z.string(), z.boolean()]))
          .optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((configuration, context) => {
    const keys = configuration.questionnaire.questions.map(
      (question) => question.id,
    );
    const orders = configuration.questionnaire.questions.map(
      (question) => question.displayOrder,
    );
    if (new Set(keys).size !== keys.length)
      context.addIssue({
        code: 'custom',
        message: 'Question identifiers must be unique',
        path: ['questionnaire', 'questions'],
      });
    if (new Set(orders).size !== orders.length)
      context.addIssue({
        code: 'custom',
        message: 'Question display order must be unique',
        path: ['questionnaire', 'questions'],
      });
    const { selectionWindowOpensAt: opens, selectionWindowClosesAt: closes } =
      configuration.opportunityPolicy;
    if (opens && closes && new Date(opens) >= new Date(closes))
      context.addIssue({
        code: 'custom',
        message: 'Selection window opening must precede closing',
        path: ['opportunityPolicy', 'selectionWindowClosesAt'],
      });
    const allowed = configuration.eligibilityRule.allowedJurisdictions ?? [];
    const excluded = configuration.eligibilityRule.excludedJurisdictions ?? [];
    if (allowed.some((jurisdiction) => excluded.includes(jurisdiction)))
      context.addIssue({
        code: 'custom',
        message: 'A jurisdiction cannot be both allowed and excluded',
        path: ['eligibilityRule'],
      });
  });

export type EligibilityConfigurationDto = z.infer<
  typeof eligibilityConfigurationSchema
>;

export function parsePublicationSourceType(
  value: string,
): PublicationSourceType {
  if (
    !Object.values(PublicationSourceType).includes(
      value as PublicationSourceType,
    )
  )
    throw new Error('Invalid publication source type');
  return value as PublicationSourceType;
}
