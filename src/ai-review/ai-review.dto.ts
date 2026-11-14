import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const grantAIReviewConsentSchema = z.object({
  retentionDays: z.number().int().min(1).max(365).default(90),
});

export const aiReviewAdvisoryOutputSchema = z.strictObject({
  summary: z.string().min(1).max(4000),
  observations: z.array(z.string().min(1).max(2000)).max(50),
});

export const aiReviewSourceReferenceSchema = z.strictObject({
  sourceType: z.enum([
    'Application',
    'Source',
    'Applicant',
    'Proposal',
    'Answer',
    'Document',
  ]),
  sourceId: z.uuid(),
  fieldPath: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*$/)
    .max(240),
  documentId: z.uuid().optional(),
});

export const recordAIReviewInputSchema = z.strictObject({
  applicationId: z.uuid(),
  modelProvider: z.string().trim().min(1).max(80),
  modelName: z.string().trim().min(1).max(120),
  modelVersion: z.string().trim().min(1).max(80),
  promptVersion: z.string().trim().min(1).max(80),
  citedSources: z.array(aiReviewSourceReferenceSchema).min(1).max(100),
  uncertaintyFlags: z.array(z.string().trim().min(1).max(500)).max(100),
  advisoryOutput: aiReviewAdvisoryOutputSchema,
});

export class GrantAIReviewConsentDto {
  @ApiProperty({
    required: false,
    minimum: 1,
    maximum: 365,
    default: 90,
    example: 90,
  })
  retentionDays!: number;
}

export class AIReviewConsentResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: 'b53c0dc7-59fc-4bcf-9ca2-7234b968d265',
  })
  id!: string;

  @ApiProperty({ example: 'ai-review-v1' })
  policyVersion!: string;

  @ApiProperty({ example: '2026-11-14T12:00:00.000Z' })
  grantedAt!: Date;

  @ApiProperty({ example: '2027-02-12T12:00:00.000Z' })
  retentionUntil!: Date;
}

export class AIReviewResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '2c914d24-a46c-44a9-bdd1-12d85719af34',
  })
  id!: string;

  @ApiProperty({ example: 'openai' })
  modelProvider!: string;

  @ApiProperty({ example: 'review-model' })
  modelName!: string;

  @ApiProperty({ example: '2026-10-15' })
  modelVersion!: string;

  @ApiProperty({ example: 'application-review-v2' })
  promptVersion!: string;

  @ApiProperty({
    type: 'array',
    example: [
      {
        sourceType: 'Answer',
        sourceId: '98d913dc-334c-4d53-87f0-a857ab9ad383',
        fieldPath: 'team.experience',
        documentId: '3b33c29f-e525-4319-9a63-66cf4b62e93b',
      },
    ],
  })
  citedSources!: unknown[];

  @ApiProperty({
    type: [String],
    example: ['Evidence is self-reported and not independently verified'],
  })
  uncertaintyFlags!: string[];

  @ApiProperty({
    type: 'object',
    additionalProperties: false,
    example: {
      summary: 'The proposal describes an early pilot.',
      observations: ['The timeline is specified in the application.'],
    },
  })
  advisoryOutput!: { summary: string; observations: string[] };

  @ApiProperty({ example: '2026-11-14T12:00:00.000Z' })
  createdAt!: Date;
}
