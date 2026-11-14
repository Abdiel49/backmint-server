import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const agreementAcceptanceChallengeSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/i),
  partyKey: z.string().min(1).max(80),
});

export const agreementAcceptanceSchema = z.strictObject({
  ...agreementAcceptanceChallengeSchema.shape,
  challengeId: z.uuid(),
  nonce: z.string().min(40).max(50),
  signature: z.string().regex(/^[A-Za-z0-9+/]{86}==$/),
});

export class AgreementAcceptanceChallengeDto {
  @ApiProperty({ example: 2, minimum: 1 })
  expectedVersion!: number;

  @ApiProperty({
    example:
      'db5b3c2c859e239a50e8a9443b2e1b8cf662b48f9012c08b60e8a3a8c99f45c1',
    pattern: '^[a-f0-9]{64}$',
  })
  expectedHash!: string;

  @ApiProperty({ example: 'recipient-org', maxLength: 80 })
  partyKey!: string;
}

export class AgreementAcceptanceDto extends AgreementAcceptanceChallengeDto {
  @ApiProperty({
    format: 'uuid',
    example: '1d76e1ac-dba2-46b0-8496-a13328682d2b',
  })
  challengeId!: string;

  @ApiProperty({
    example: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=',
    description: 'Base64-encoded 32-byte one-time challenge nonce.',
  })
  nonce!: string;

  @ApiProperty({
    example: `${'A'.repeat(86)}==`,
    description: 'Base64-encoded 64-byte Ed25519 NEP-413 signature.',
  })
  signature!: string;
}

export class AgreementAcceptanceChallengeResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '1d76e1ac-dba2-46b0-8496-a13328682d2b',
  })
  id!: string;

  @ApiProperty({
    example:
      '{"type":"backmint.agreement.acceptance","challengeId":"1d76e1ac-dba2-46b0-8496-a13328682d2b","agreementId":"a38f9153-4d27-4d3a-bc21-40f67691b8ef","version":2,"termsHash":"db5b3c2c859e239a50e8a9443b2e1b8cf662b48f9012c08b60e8a3a8c99f45c1","partyKey":"recipient-org","userId":"f2625a81-2af8-4c5b-943a-07c4763fce29","walletLinkId":"1ed85f24-fbe3-4a2b-8570-85571d64b76f","accountId":"alice.testnet","publicKey":"ed25519:11111111111111111111111111111111","network":"near:testnet","agreementNetwork":"near:testnet","recipient":"backmint-server","expiresAt":"2026-11-14T12:05:00.000Z"}',
  })
  message!: string;

  @ApiProperty({
    example: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=',
    description: 'Base64-encoded 32-byte one-time challenge nonce.',
  })
  nonce!: string;

  @ApiProperty({ example: 'alice.testnet' })
  accountId!: string;

  @ApiProperty({ example: 'ed25519:11111111111111111111111111111111' })
  publicKey!: string;

  @ApiProperty({ example: 'near:testnet' })
  network!: string;

  @ApiProperty({ example: 'backmint-server' })
  recipient!: string;

  @ApiProperty({ example: '2026-11-14T12:05:00.000Z' })
  expiresAt!: Date;
}
