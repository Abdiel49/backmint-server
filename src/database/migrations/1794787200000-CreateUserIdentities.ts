import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserIdentities1794787200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar(320),
        "displayName" varchar(160) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'Active',
        "locale" varchar(16) NOT NULL DEFAULT 'en',
        "stateVersion" integer NOT NULL DEFAULT 1,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CK_users_status" CHECK ("status" IN ('Active', 'Suspended', 'Deactivated'))
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_users_email_normalized" ON "users" (lower("email")) WHERE "email" IS NOT NULL',
    );
    await queryRunner.query(`
      CREATE TABLE "identity_providers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "provider" varchar(24) NOT NULL,
        "subject" varchar(320) NOT NULL,
        "verifiedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CK_identity_providers_provider" CHECK ("provider" IN ('Email', 'Google', 'Apple', 'Wallet'))
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_identity_providers_provider_subject" ON "identity_providers" ("provider", "subject")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "identity_providers"');
    await queryRunner.query('DROP TABLE "users"');
  }
}
