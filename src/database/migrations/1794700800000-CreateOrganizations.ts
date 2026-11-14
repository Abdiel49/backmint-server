import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrganizations1794700800000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "organizations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug" varchar(80) NOT NULL,
        "name" varchar(160) NOT NULL,
        "organizationType" varchar(32) NOT NULL,
        "country" char(2) NOT NULL,
        "legalStatus" varchar(24) NOT NULL,
        "visibility" varchar(16) NOT NULL DEFAULT 'Private',
        "status" varchar(16) NOT NULL DEFAULT 'Active',
        "ownerUserId" uuid NOT NULL,
        "stateVersion" integer NOT NULL DEFAULT 1,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CK_organizations_type" CHECK ("organizationType" IN ('Company', 'Community', 'Foundation', 'Nonprofit', 'EducationalInstitution', 'Government', 'Other')),
        CONSTRAINT "CK_organizations_country" CHECK ("country" ~ '^[A-Z]{2}$'),
        CONSTRAINT "CK_organizations_legal_status" CHECK ("legalStatus" IN ('Incorporated', 'Informal')),
        CONSTRAINT "CK_organizations_visibility" CHECK ("visibility" IN ('Private', 'Unlisted', 'Public')),
        CONSTRAINT "CK_organizations_status" CHECK ("status" IN ('Active', 'Suspended', 'Archived'))
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_organizations_slug" ON "organizations" ("slug")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "organizations"');
  }
}
