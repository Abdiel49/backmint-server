import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const createOutcomeClaimSchema = z.strictObject({
  sourceType: z.enum(['Project', 'Call']),
  sourceId: z.uuid(),
  metricType: z.string().regex(/^[A-Za-z][A-Za-z0-9._-]{0,63}$/),
  value: z.string().regex(/^-?(0|[1-9]\d{0,63})(\.\d{1,24})?$/),
  unit: z.string().regex(/^[A-Za-z][A-Za-z0-9._/-]{0,31}$/),
  evidenceStorageKey: z.string().trim().min(1).max(512),
  evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const reviewOutcomeClaimSchema = z.strictObject({
  note: z.string().trim().min(1).max(1000),
});

export class CreateOutcomeClaimDto {
  @ApiProperty({ enum: ['Project', 'Call'], example: 'Call' })
  sourceType!: 'Project' | 'Call';

  @ApiProperty({
    format: 'uuid',
    example: 'f64f0d7f-d6f1-4c33-b27e-9aefb8b1f11c',
  })
  sourceId!: string;

  @ApiProperty({ example: 'households_reached' })
  metricType!: string;

  @ApiProperty({
    example: '1250.5',
    description:
      'Exact decimal string; no floating-point conversion is performed.',
  })
  value!: string;

  @ApiProperty({ example: 'people' })
  unit!: string;

  @ApiProperty({ example: 'outcomes/solar-call-2026/impact-report.pdf' })
  evidenceStorageKey!: string;

  @ApiProperty({ example: 'a'.repeat(64) })
  evidenceSha256!: string;
}

export class ReviewOutcomeClaimDto {
  @ApiProperty({
    example:
      'Reviewed the uploaded monitoring report; the reported count is supported by the cited evidence.',
  })
  note!: string;
}
