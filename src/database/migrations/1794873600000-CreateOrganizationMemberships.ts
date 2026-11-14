import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrganizationMemberships1794873600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "organization_memberships" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organizationId" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "role" varchar(24) NOT NULL,
        "status" varchar(16) NOT NULL,
        "invitedByUserId" uuid NOT NULL REFERENCES "users"("id"),
        "acceptedAt" timestamptz,
        "revokedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CK_organization_memberships_role" CHECK ("role" IN ('Owner', 'Admin', 'ProjectManager', 'Evaluator', 'FinanceApprover', 'Representative', 'Observer')),
        CONSTRAINT "CK_organization_memberships_status" CHECK ("status" IN ('Invited', 'Active', 'Suspended', 'Revoked')),
        CONSTRAINT "CK_organization_memberships_acceptance" CHECK (("status" IN ('Active', 'Suspended') AND "acceptedAt" IS NOT NULL) OR ("status" IN ('Invited', 'Revoked'))),
        CONSTRAINT "CK_organization_memberships_revocation" CHECK (("status" = 'Revoked' AND "revokedAt" IS NOT NULL) OR ("status" <> 'Revoked' AND "revokedAt" IS NULL))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_organization_memberships_active_pair"
      ON "organization_memberships" ("organizationId", "userId")
      WHERE "status" IN ('Invited', 'Active', 'Suspended')
    `);
    await queryRunner.query(`
      INSERT INTO "organization_memberships"
        ("organizationId", "userId", "role", "status", "invitedByUserId", "acceptedAt")
      SELECT "id", "ownerUserId", 'Owner', 'Active', "ownerUserId", "createdAt"
      FROM "organizations"
      ON CONFLICT ("organizationId", "userId")
        WHERE "status" IN ('Invited', 'Active', 'Suspended') DO NOTHING
    `);
    await queryRunner.query(`
      CREATE TABLE "organization_representatives" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organizationId" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "verifiedByUserId" uuid NOT NULL REFERENCES "users"("id"),
        "verifiedAt" timestamptz NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "verificationReference" varchar(500) NOT NULL,
        "revokedAt" timestamptz,
        "revokedByUserId" uuid REFERENCES "users"("id"),
        "revocationReason" varchar(500),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CK_organization_representatives_expiry" CHECK ("expiresAt" > "verifiedAt"),
        CONSTRAINT "CK_organization_representatives_revocation" CHECK (("revokedAt" IS NULL AND "revokedByUserId" IS NULL AND "revocationReason" IS NULL) OR ("revokedAt" IS NOT NULL AND "revokedByUserId" IS NOT NULL AND "revocationReason" IS NOT NULL))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IX_organization_representatives_authority"
      ON "organization_representatives" ("organizationId", "userId", "expiresAt")
      WHERE "revokedAt" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "organization_representatives"');
    await queryRunner.query('DROP TABLE "organization_memberships"');
  }
}
