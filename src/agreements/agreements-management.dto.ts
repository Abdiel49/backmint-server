import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

const partySchema = z.strictObject({
  key: z.string().trim().min(1).max(80),
  role: z.enum(['Funder', 'Recipient', 'Verifier']),
  organizationId: z.uuid().optional(),
  userId: z.uuid().optional(),
  required: z.boolean(),
});

const termsSchema = z.strictObject({
  network: z.string().trim().min(1).max(128),
  asset: z.string().trim().min(1).max(128),
  parties: z.array(partySchema).min(1).max(20),
  milestones: z.array(z.record(z.string(), z.unknown())).max(100),
  verificationAuthority: z.record(z.string(), z.unknown()),
  deadlines: z.record(z.string(), z.string().trim().min(1).max(128)),
  cancellationPolicy: z.record(z.string(), z.unknown()),
  disputePolicy: z.record(z.string(), z.unknown()),
  refundPolicy: z.record(z.string(), z.unknown()),
  legalTerms: z.record(z.string(), z.unknown()),
  economicTerms: z.record(z.string(), z.unknown()),
});

export const agreementVersionInputSchema = z.strictObject({
  terms: termsSchema,
  acceptanceExpiresAt: z.iso.datetime({ offset: true }),
  contractArtifactReference: z.string().trim().min(1).max(255),
});

export class AgreementVersionInputDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: false,
    example: {
      network: 'near:testnet',
      asset: 'NEAR',
      parties: [
        {
          key: 'funder-org',
          role: 'Funder',
          organizationId: '7a93fc29-42a1-4be9-901f-450e261dcd07',
          required: true,
        },
        {
          key: 'recipient-org',
          role: 'Recipient',
          organizationId: '8b04fd39-53b2-4cf0-a12f-561e372edc18',
          required: true,
        },
      ],
      milestones: [
        { sequence: 1, allocationBaseUnits: '1000000000000000000000000', acceptanceCriteria: { deliverable: 'Commissioned solar installation' }, reviewerUserId: 'a621a439-b8ae-450e-9e08-94f635a61dce', dueAt: '2027-06-01T12:00:00.000Z' },
      ],
      verificationAuthority: { type: 'funder-review' },
      deadlines: { completion: '2027-06-30T23:59:59.000Z' },
      cancellationPolicy: { permitted: true },
      disputePolicy: { process: 'mediation' },
      refundPolicy: { unspentFunds: 'return-to-funder' },
      legalTerms: { governingLaw: 'Bolivia' },
      economicTerms: { allocationBaseUnits: '1000000000000000000000000' },
    },
  })
  terms!: z.infer<typeof termsSchema>;

  @ApiProperty({ format: 'date-time', example: '2027-01-15T18:00:00.000Z' })
  acceptanceExpiresAt!: string;

  @ApiProperty({ example: 'backmint-contracts:escrow-v1' })
  contractArtifactReference!: string;
}
