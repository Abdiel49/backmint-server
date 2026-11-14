import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWalletLinks1794873600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "wallet_challenges" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "accountId" varchar(64) NOT NULL,
        "message" varchar(255) NOT NULL,
        "nonceHash" varchar(64) NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "usedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_wallet_challenges_nonce_hash" ON "wallet_challenges" ("nonceHash")',
    );
    await queryRunner.query(`
      CREATE TABLE "wallet_links" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "accountId" varchar(64) NOT NULL,
        "publicKey" varchar(96) NOT NULL,
        "verifiedAt" timestamptz NOT NULL,
        "revokedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_wallet_links_active_account" ON "wallet_links" ("accountId") WHERE "revokedAt" IS NULL',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_wallet_links_user_active" ON "wallet_links" ("userId") WHERE "revokedAt" IS NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "wallet_links"');
    await queryRunner.query('DROP TABLE "wallet_challenges"');
  }
}
