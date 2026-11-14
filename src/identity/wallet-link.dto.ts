import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

const accountIdPattern = /^(?:[a-z0-9]+[._-])*[a-z0-9]+$/;

export const issueWalletChallengeSchema = z.strictObject({
  accountId: z.string().min(2).max(64).regex(accountIdPattern),
});

export const verifyWalletLinkSchema = z.strictObject({
  challengeId: z.uuid(),
  nonce: z.string().min(40).max(50),
  signature: z.string().regex(/^[A-Za-z0-9+/]{86}==$/),
  publicKey: z.string().regex(/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,50}$/),
});

export class IssueWalletChallengeDto {
  @ApiProperty({ example: 'alice.testnet', minLength: 2, maxLength: 64 })
  accountId!: string;
}

export class VerifyWalletLinkDto {
  @ApiProperty({
    format: 'uuid',
    example: '5ac4e770-0f69-4d72-99e3-4d7f853499f4',
  })
  challengeId!: string;

  @ApiProperty({
    example: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=',
    description: 'Base64-encoded 32-byte challenge nonce.',
  })
  nonce!: string;

  @ApiProperty({
    example: `${'A'.repeat(86)}==`,
    description: 'Base64-encoded 64-byte NEP-413 signature.',
  })
  signature!: string;

  @ApiProperty({ example: 'ed25519:11111111111111111111111111111111' })
  publicKey!: string;
}

export class WalletChallengeResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '5ac4e770-0f69-4d72-99e3-4d7f853499f4',
  })
  id!: string;

  @ApiProperty({
    example:
      'Link NEAR account alice.testnet to Backmint user f2625a81-2af8-4c5b-943a-07c4763fce29. Challenge 5ac4e770-0f69-4d72-99e3-4d7f853499f4. Expires 2026-11-14T12:05:00.000Z.',
  })
  message!: string;

  @ApiProperty({ example: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=' })
  nonce!: string;

  @ApiProperty({ example: 'backmint-server' })
  recipient!: string;

  @ApiProperty({ example: 'testnet', enum: ['testnet', 'mainnet'] })
  network!: string;

  @ApiProperty({ example: '2026-11-14T12:05:00.000Z' })
  expiresAt!: Date;
}

export class WalletLinkResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '1ed85f24-fbe3-4a2b-8570-85571d64b76f',
  })
  id!: string;

  @ApiProperty({ example: 'alice.testnet' })
  accountId!: string;

  @ApiProperty({ example: 'testnet', enum: ['testnet', 'mainnet'] })
  network!: string;

  @ApiProperty({ example: 'ed25519:11111111111111111111111111111111' })
  publicKey!: string;

  @ApiProperty({ example: '2026-11-14T12:00:00.000Z' })
  verifiedAt!: Date;

  @ApiProperty({ example: '2026-11-14T12:00:00.000Z' })
  createdAt!: Date;
}
