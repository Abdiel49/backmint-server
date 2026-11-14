import { z } from 'zod';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const verificationUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(160),
  contentLength: z.number().int().positive().max(25_000_000),
  checksumSha256: z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
});

export type VerificationUploadDto = z.infer<typeof verificationUploadSchema>;

export class VerificationUploadRequestDto {
  @ApiProperty({ example: 'registration-certificate.pdf', maxLength: 255 })
  fileName!: string;
  @ApiProperty({ example: 'application/pdf', maxLength: 160 })
  contentType!: string;
  @ApiProperty({ example: 182440, minimum: 1, maximum: 25000000 })
  contentLength!: number;
  @ApiProperty({ example: '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=' })
  checksumSha256!: string;
}

export const verificationDecisionSchema = z.object({
  decision: z.enum(['NeedsInfo', 'Verified', 'Rejected']),
  reason: z.string().trim().min(1).max(4000),
  expiresAt: z.iso.datetime().optional(),
});

export type VerificationDecisionDto = z.infer<
  typeof verificationDecisionSchema
>;

export class VerificationDecisionRequestDto {
  @ApiProperty({
    enum: ['NeedsInfo', 'Verified', 'Rejected'],
    example: 'NeedsInfo',
  })
  decision!: 'NeedsInfo' | 'Verified' | 'Rejected';
  @ApiProperty({
    example: 'Please provide a current registration certificate.',
    maxLength: 4000,
  })
  reason!: string;
  @ApiPropertyOptional({
    example: '2027-11-14T12:00:00.000Z',
    format: 'date-time',
  })
  expiresAt?: string;
}

export const verificationRevocationSchema = z.object({
  reason: z.string().trim().min(1).max(4000),
});

export class VerificationRevocationRequestDto {
  @ApiProperty({
    example: 'The submitted evidence was superseded by a corrected filing.',
    maxLength: 4000,
  })
  reason!: string;
}
