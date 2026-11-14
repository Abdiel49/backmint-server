import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const createMilestoneEvidenceSchema = z.strictObject({
  assets: z.array(z.strictObject({
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
    mimeType: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/).max(255),
    sizeBytes: z.number().int().positive().max(50_000_000),
  })).min(1).max(10),
});

export class CreateMilestoneEvidenceDto {
  @ApiProperty({
    type: 'array',
    minItems: 1,
    maxItems: 10,
    example: [
      {
        checksumSha256: 'a'.repeat(64),
        mimeType: 'application/pdf',
        sizeBytes: 524288,
      },
    ],
    items: {
      type: 'object',
      additionalProperties: false,
      properties: {
        checksumSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        mimeType: { type: 'string', example: 'application/pdf' },
        sizeBytes: { type: 'integer', minimum: 1, maximum: 50000000 },
      },
      required: ['checksumSha256', 'mimeType', 'sizeBytes'],
    },
  })
  assets!: Array<{
    checksumSha256: string;
    mimeType: string;
    sizeBytes: number;
  }>;
}
