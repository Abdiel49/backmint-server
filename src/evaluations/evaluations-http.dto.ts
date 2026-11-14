import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

export const createEvaluationRoundSchema = z.strictObject({
  sourceType: z.enum(['Project', 'Call']),
  sourceId: z.uuid(),
  stage: z.string().trim().min(1).max(48),
  rubricVersion: z.number().int().positive(),
  rubric: z
    .record(z.string(), z.unknown())
    .refine((value) => Object.keys(value).length > 0),
});

export const assignEvaluationSchema = z.strictObject({
  evaluatorUserId: z.uuid(),
  applicationId: z.uuid().optional(),
  fundingOfferId: z.uuid().optional(),
});

export const declareEvaluationConflictSchema = z.strictObject({
  hasConflict: z.boolean(),
  reason: z.string().trim().min(1).max(4000).optional(),
});

export const submitEvaluationSchema = z.strictObject({
  findings: z.record(z.string(), z.unknown()),
  rubricScores: z.record(z.string(), z.number().finite().nonnegative()),
  eligibilityDecision: z.enum([
    'Eligible',
    'NeedsReview',
    'Ineligible',
    'MissingInformation',
  ]),
  recommendation: z.enum([
    'Recommend',
    'DoNotRecommend',
    'NeedsDiscussion',
    'NoRecommendation',
  ]),
  notes: z.string().trim().min(1).max(10000),
});

export class CreateEvaluationRoundDto {
  @ApiProperty({ enum: ['Project', 'Call'], example: 'Call' }) sourceType!:
    'Project' | 'Call';
  @ApiProperty({
    format: 'uuid',
    example: 'ca51fe38-0730-44cc-8ae6-2d84f6f6579d',
  })
  sourceId!: string;
  @ApiProperty({ example: 'InitialReview' }) stage!: string;
  @ApiProperty({ minimum: 1, example: 1 }) rubricVersion!: number;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { impact: { maxScore: 5 }, feasibility: { maxScore: 5 } },
  })
  rubric!: Record<string, unknown>;
}

export class AssignEvaluationDto {
  @ApiProperty({
    format: 'uuid',
    example: 'c8c7cb41-a8d7-4fb9-b315-f1b53127840a',
  })
  evaluatorUserId!: string;
  @ApiPropertyOptional({
    format: 'uuid',
    example: 'f67f060d-9b8a-433e-b755-f5be73824b70',
  })
  applicationId?: string;
  @ApiPropertyOptional({
    format: 'uuid',
    example: '8ceaf2d0-5047-47e8-9757-f8269b8d4101',
  })
  fundingOfferId?: string;
}

export class DeclareEvaluationConflictDto {
  @ApiProperty({ example: false }) hasConflict!: boolean;
  @ApiPropertyOptional({
    example: 'I previously worked with the applicant organization.',
  })
  reason?: string;
}

export class SubmitEvaluationDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: {
      strengths: ['Clear delivery plan'],
      risks: ['Unverified adoption estimate'],
    },
  })
  findings!: Record<string, unknown>;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { impact: 4, feasibility: 3 },
  })
  rubricScores!: Record<string, number>;
  @ApiProperty({
    enum: ['Eligible', 'NeedsReview', 'Ineligible', 'MissingInformation'],
    example: 'Eligible',
  })
  eligibilityDecision!: string;
  @ApiProperty({
    enum: [
      'Recommend',
      'DoNotRecommend',
      'NeedsDiscussion',
      'NoRecommendation',
    ],
    example: 'Recommend',
  })
  recommendation!: string;
  @ApiProperty({
    example:
      'The proposal meets the published eligibility rules and provides a credible delivery plan.',
  })
  notes!: string;
}
