import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

export const createAwardFromApplicationSchema = z.strictObject({
  allocation: z.string().regex(/^[1-9][0-9]*$/),
  asset: z.string().trim().min(1).max(128),
  expiresAt: z.iso.datetime({ offset: true }),
  terms: z.record(z.string(), z.unknown()).optional(),
});

export const createAwardFromFundingOfferSchema = z.strictObject({
  expiresAt: z.iso.datetime({ offset: true }),
  terms: z.record(z.string(), z.unknown()).optional(),
});

export const awardRecipientResponseSchema = z.strictObject({
  recipientOrganizationId: z.uuid().nullable(),
});

export class CreateAwardFromApplicationDto {
  @ApiProperty({
    example: '250000000000000000000000',
    description: 'Positive integer in the source asset base units.',
  })
  allocation!: string;

  @ApiProperty({ example: 'NEAR' })
  asset!: string;

  @ApiProperty({
    format: 'date-time',
    example: '2027-01-15T18:00:00.000Z',
  })
  expiresAt!: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: {
      purpose: 'Install solar equipment for the approved rural clinic project',
      reportingDeadline: '2027-03-31',
    },
  })
  terms?: Record<string, unknown>;
}

export class CreateAwardFromFundingOfferDto {
  @ApiProperty({
    format: 'date-time',
    example: '2027-01-15T18:00:00.000Z',
  })
  expiresAt!: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: {
      purpose: 'Fund the community water testing program',
      reportingDeadline: '2027-03-31',
    },
  })
  terms?: Record<string, unknown>;
}

export class AwardRecipientResponseDto {
  @ApiProperty({
    format: 'uuid',
    nullable: true,
    example: '7a93fc29-42a1-4be9-901f-450e261dcd07',
    description:
      'Required organization context for an organization recipient; use null for an individual recipient.',
  })
  recipientOrganizationId!: string | null;
}
