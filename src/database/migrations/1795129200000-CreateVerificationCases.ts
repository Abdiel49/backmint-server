import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVerificationCases1795129200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "verification_cases" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organizationId" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "status" varchar(16) NOT NULL DEFAULT 'NotStarted'
          CHECK ("status" IN ('NotStarted', 'Pending', 'NeedsInfo', 'Verified', 'Rejected', 'Expired', 'Revoked')),
        "createdByUserId" uuid NOT NULL REFERENCES "users"("id"),
        "decidedByUserId" uuid REFERENCES "users"("id"),
        "decisionReason" text,
        "expiresAt" timestamptz,
        "revokedAt" timestamptz,
        "stateVersion" integer NOT NULL DEFAULT 1,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_verification_cases_organization" UNIQUE ("organizationId")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "verification_documents" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "verificationCaseId" uuid NOT NULL REFERENCES "verification_cases"("id") ON DELETE CASCADE,
        "objectKey" varchar(512) NOT NULL UNIQUE,
        "fileName" varchar(255) NOT NULL,
        "contentType" varchar(160) NOT NULL,
        "contentLength" integer NOT NULL CHECK ("contentLength" > 0),
        "checksumSha256" varchar(44) NOT NULL,
        "uploadedByUserId" uuid NOT NULL REFERENCES "users"("id"),
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "verification_reviews" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "verificationCaseId" uuid NOT NULL REFERENCES "verification_cases"("id") ON DELETE CASCADE,
        "reviewerUserId" uuid NOT NULL REFERENCES "users"("id"),
        "decision" varchar(16) NOT NULL CHECK ("decision" IN ('NeedsInfo', 'Verified', 'Rejected')),
        "reason" text NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_verification_cases_status_expiry" ON "verification_cases" ("status", "expiresAt")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_verification_reviews_case" ON "verification_reviews" ("verificationCaseId", "createdAt")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "verification_reviews"');
    await queryRunner.query('DROP TABLE "verification_documents"');
    await queryRunner.query('DROP TABLE "verification_cases"');
  }
}
