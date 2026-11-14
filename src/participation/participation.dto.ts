import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

const recordSchema = z.record(z.string(), z.unknown());

export const submitApplicationSchema = z.strictObject({
  sourceType: z.enum(['Project', 'Call']),
  sourceId: z.uuid(),
  applicantOrganizationId: z.uuid().optional(),
  referencedProjectId: z.uuid().optional(),
  proposal: recordSchema,
  answers: z
    .array(
      z.strictObject({
        questionKey: z.string().trim().min(1).max(80),
        answer: z.unknown(),
        attachmentIds: z.array(z.uuid()).max(50).optional(),
      }),
    )
    .max(200),
});

export const submitFundingOfferSchema = z.strictObject({
  sourceType: z.enum(['Project', 'Call']),
  sourceId: z.uuid(),
  funderOrganizationId: z.uuid().optional(),
  amount: z
    .string()
    .regex(/^[1-9][0-9]{0,77}$/)
    .optional(),
  asset: z.string().trim().min(1).max(128).optional(),
  supportDescription: z.string().trim().min(1).max(500).optional(),
  supportType: z.string().trim().min(1).max(80).optional(),
  restrictedPurpose: z.string().trim().min(1).max(500).optional(),
  conditions: recordSchema,
});

export class SubmitApplicationDto {
  @ApiProperty({ enum: ['Project', 'Call'], example: 'Call' })
  sourceType!: 'Project' | 'Call';

  @ApiProperty({
    format: 'uuid',
    example: 'f64f0d7f-d6f1-4c33-b27e-9aefb8b1f11c',
  })
  sourceId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    example: 'cb3662f4-d5b7-4ee8-9cf7-858a81a847a7',
  })
  applicantOrganizationId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    example: '71d94885-9e19-4827-bdbb-3de3d5333e3b',
  })
  referencedProjectId?: string;

  @ApiProperty({
    example: {
      title: 'Solar training program',
      summary: 'A community-led pilot.',
    },
  })
  proposal!: Record<string, unknown>;

  @ApiProperty({
    example: [
      {
        questionKey: 'team_experience',
        answer: 'Five years of community energy work.',
      },
    ],
  })
  answers!: Array<{
    questionKey: string;
    answer: unknown;
    attachmentIds?: string[];
  }>;
}

export class SubmitFundingOfferDto {
  @ApiProperty({ enum: ['Project', 'Call'], example: 'Project' })
  sourceType!: 'Project' | 'Call';

  @ApiProperty({
    format: 'uuid',
    example: '8ab31b75-c38c-4be2-a68f-d74c95ee72ae',
  })
  sourceId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    example: 'cb3662f4-d5b7-4ee8-9cf7-858a81a847a7',
  })
  funderOrganizationId?: string;

  @ApiPropertyOptional({
    example: '2500000000000000000000000',
    description: 'Positive integer amount in the asset base unit.',
  })
  amount?: string;

  @ApiPropertyOptional({ example: 'NEAR' })
  asset?: string;

  @ApiPropertyOptional({
    example: 'Provide 40 solar panels and installation support.',
  })
  supportDescription?: string;

  @ApiPropertyOptional({ example: 'Equipment' })
  supportType?: string;

  @ApiPropertyOptional({ example: 'Community solar equipment only.' })
  restrictedPurpose?: string;

  @ApiProperty({
    example: {
      reporting: 'Quarterly impact report',
      disbursement: 'Upon agreement signature',
    },
  })
  conditions!: Record<string, unknown>;
}

export const submissionPageSchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
