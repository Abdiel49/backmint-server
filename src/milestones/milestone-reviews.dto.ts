import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const createMilestoneReviewSchema = z.strictObject({
  evidenceVersion: z.number().int().positive(),
  verdict: z.enum(['Approved', 'Rejected', 'ChangesRequested']),
  notes: z.string().trim().min(1).max(1000),
});

export class CreateMilestoneReviewDto {
  @ApiProperty({ example: 2, minimum: 1 })
  evidenceVersion!: number;

  @ApiProperty({ enum: ['Approved', 'Rejected', 'ChangesRequested'], example: 'ChangesRequested' })
  verdict!: 'Approved' | 'Rejected' | 'ChangesRequested';

  @ApiProperty({ example: 'Please include the signed attendance sheet for the second workshop.' })
  notes!: string;
}
