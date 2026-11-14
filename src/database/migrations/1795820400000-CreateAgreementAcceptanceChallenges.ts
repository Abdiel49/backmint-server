import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAgreementAcceptanceChallenges1795820400000
  implements MigrationInterface
{
  name = 'CreateAgreementAcceptanceChallenges1795820400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "agreement_acceptance_challenges" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "agreementId" uuid NOT NULL REFERENCES "agreements"("id") ON DELETE CASCADE,
        "version" integer NOT NULL,
        "termsHash" varchar(64) NOT NULL CHECK ("termsHash" ~ '^[a-f0-9]{64}$'),
        "partyKey" varchar(80) NOT NULL,
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "walletLinkId" uuid NOT NULL REFERENCES "wallet_links"("id") ON DELETE RESTRICT,
        "accountId" varchar(64) NOT NULL,
        "publicKey" varchar(96) NOT NULL,
        "network" varchar(128) NOT NULL,
        "recipient" varchar(255) NOT NULL,
        "nonceHash" varchar(64) NOT NULL CHECK ("nonceHash" ~ '^[a-f0-9]{64}$'),
        "message" text NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "usedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_agreement_acceptance_challenges" PRIMARY KEY ("id"),
        CONSTRAINT "FK_agreement_acceptance_challenge_version" FOREIGN KEY ("agreementId", "version") REFERENCES "agreement_versions"("agreementId", "version") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_agreement_acceptance_challenges_nonce_hash" ON "agreement_acceptance_challenges" ("nonceHash")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_agreement_acceptance_challenges_user_expiry" ON "agreement_acceptance_challenges" ("userId", "expiresAt")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX "IDX_agreement_acceptance_challenges_user_expiry"',
    );
    await queryRunner.query(
      'DROP INDEX "UQ_agreement_acceptance_challenges_nonce_hash"',
    );
    await queryRunner.query('DROP TABLE "agreement_acceptance_challenges"');
  }
}
