import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWalletProofToAgreementAcceptances1795820401000
  implements MigrationInterface
{
  name = 'AddWalletProofToAgreementAcceptances1795820401000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "agreement_party_acceptances"
        ADD "acceptanceChallengeId" uuid,
        ADD "walletLinkId" uuid REFERENCES "wallet_links"("id") ON DELETE RESTRICT,
        ADD "signingAccountId" varchar(64),
        ADD "signingPublicKey" varchar(96),
        ADD "signingNetwork" varchar(128),
        ADD "signingRecipient" varchar(255),
        ADD "signedMessage" text,
        ADD "signingNonce" varchar(44),
        ADD "walletSignature" varchar(88),
        ADD CONSTRAINT "FK_agreement_acceptance_challenge" FOREIGN KEY ("acceptanceChallengeId") REFERENCES "agreement_acceptance_challenges"("id") ON DELETE RESTRICT,
        ADD CONSTRAINT "CHK_agreement_acceptance_wallet_proof_complete" CHECK (
          ("acceptanceChallengeId" IS NULL AND "walletLinkId" IS NULL AND "signingAccountId" IS NULL AND "signingPublicKey" IS NULL AND "signingNetwork" IS NULL AND "signingRecipient" IS NULL AND "signedMessage" IS NULL AND "signingNonce" IS NULL AND "walletSignature" IS NULL)
          OR
          ("acceptanceChallengeId" IS NOT NULL AND "walletLinkId" IS NOT NULL AND "signingAccountId" IS NOT NULL AND "signingPublicKey" IS NOT NULL AND "signingNetwork" IS NOT NULL AND "signingRecipient" IS NOT NULL AND "signedMessage" IS NOT NULL AND "signingNonce" IS NOT NULL AND "walletSignature" IS NOT NULL)
        ),
        ADD CONSTRAINT "CHK_agreement_acceptance_wallet_signature" CHECK ("walletSignature" IS NULL OR "walletSignature" ~ '^[A-Za-z0-9+/]{86}==$'),
        ADD CONSTRAINT "CHK_agreement_acceptance_signing_nonce" CHECK ("signingNonce" IS NULL OR "signingNonce" ~ '^[A-Za-z0-9+/]{43}=$')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "agreement_party_acceptances"
        DROP CONSTRAINT "CHK_agreement_acceptance_signing_nonce",
        DROP CONSTRAINT "CHK_agreement_acceptance_wallet_signature",
        DROP CONSTRAINT "CHK_agreement_acceptance_wallet_proof_complete",
        DROP CONSTRAINT "FK_agreement_acceptance_challenge",
        DROP COLUMN "walletSignature",
        DROP COLUMN "signingNonce",
        DROP COLUMN "signedMessage",
        DROP COLUMN "signingRecipient",
        DROP COLUMN "signingNetwork",
        DROP COLUMN "signingPublicKey",
        DROP COLUMN "signingAccountId",
        DROP COLUMN "walletLinkId",
        DROP COLUMN "acceptanceChallengeId"
    `);
  }
}
