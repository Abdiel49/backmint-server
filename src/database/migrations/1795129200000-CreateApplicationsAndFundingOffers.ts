import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateApplicationsAndFundingOffers1795129200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "applications" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "sourceType" varchar(16) NOT NULL CHECK ("sourceType" IN ('Project', 'Call')),
        "sourceId" uuid NOT NULL,
        "applicantOrganizationId" uuid REFERENCES "organizations"("id") ON DELETE RESTRICT,
        "applicantUserId" uuid REFERENCES "users"("id") ON DELETE RESTRICT,
        "applicantKey" varchar(96) NOT NULL,
        "referencedProjectId" uuid REFERENCES "projects"("id") ON DELETE RESTRICT,
        "sourceVersion" integer NOT NULL CHECK ("sourceVersion" > 0),
        "sourceSnapshot" jsonb NOT NULL,
        "applicantSnapshot" jsonb NOT NULL,
        "proposalSnapshot" jsonb NOT NULL,
        "status" varchar(24) NOT NULL CHECK ("status" IN ('Submitted', 'PendingFileScan', 'UnderReview', 'NeedsInformation', 'Shortlisted', 'Rejected', 'Withdrawn', 'Selected', 'Awarded')),
        "receipt" varchar(36) NOT NULL,
        "submittedAt" timestamptz NOT NULL DEFAULT now(),
        "withdrawnAt" timestamptz,
        CONSTRAINT "CK_applications_applicant" CHECK (("applicantOrganizationId" IS NOT NULL) <> ("applicantUserId" IS NOT NULL)),
        CONSTRAINT "UQ_applications_receipt" UNIQUE ("receipt")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_applications_applicant" ON "applications" ("sourceType", "sourceId", "applicantKey", "status")`,
    );
    await queryRunner.query(`
      CREATE TABLE "application_answers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "applicationId" uuid NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
        "questionKey" varchar(80) NOT NULL,
        "answer" jsonb NOT NULL,
        "attachmentIds" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "fileScanStatus" varchar(16) NOT NULL DEFAULT 'NotRequired' CHECK ("fileScanStatus" IN ('NotRequired', 'Pending')),
        CONSTRAINT "UQ_application_answers_question" UNIQUE ("applicationId", "questionKey")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "funding_offers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "sourceType" varchar(16) NOT NULL CHECK ("sourceType" IN ('Project', 'Call')),
        "sourceId" uuid NOT NULL,
        "funderOrganizationId" uuid REFERENCES "organizations"("id") ON DELETE RESTRICT,
        "funderUserId" uuid REFERENCES "users"("id") ON DELETE RESTRICT,
        "amount" numeric(78, 0) CHECK ("amount" IS NULL OR "amount" > 0),
        "asset" varchar(128),
        "supportDescription" varchar(500),
        "supportType" varchar(80),
        "restrictedPurpose" varchar(500),
        "conditionsSnapshot" jsonb NOT NULL,
        "sourceSnapshot" jsonb NOT NULL,
        "sourceVersion" integer NOT NULL CHECK ("sourceVersion" > 0),
        "status" varchar(24) NOT NULL CHECK ("status" IN ('Submitted', 'UnderReview', 'Accepted', 'Declined', 'Withdrawn')),
        "receipt" varchar(36) NOT NULL,
        "submittedAt" timestamptz NOT NULL DEFAULT now(),
        "reviewedByUserId" uuid REFERENCES "users"("id") ON DELETE RESTRICT,
        "reviewedAt" timestamptz,
        CONSTRAINT "CK_funding_offers_funder" CHECK (("funderOrganizationId" IS NOT NULL) <> ("funderUserId" IS NOT NULL)),
        CONSTRAINT "CK_funding_offers_value" CHECK ("amount" IS NOT NULL OR NULLIF(trim("supportDescription"), '') IS NOT NULL),
        CONSTRAINT "CK_funding_offers_asset" CHECK ("amount" IS NULL OR NULLIF(trim("asset"), '') IS NOT NULL),
        CONSTRAINT "UQ_funding_offers_receipt" UNIQUE ("receipt")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_funding_offers_source_status" ON "funding_offers" ("sourceType", "sourceId", "status")`,
    );
    await queryRunner.query(`
      CREATE FUNCTION "reject_submission_snapshot_update"() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_TABLE_NAME = 'applications' AND (NEW."sourceSnapshot", NEW."applicantSnapshot", NEW."proposalSnapshot", NEW."sourceVersion", NEW."applicantKey", NEW."applicantOrganizationId", NEW."applicantUserId", NEW."referencedProjectId") IS DISTINCT FROM (OLD."sourceSnapshot", OLD."applicantSnapshot", OLD."proposalSnapshot", OLD."sourceVersion", OLD."applicantKey", OLD."applicantOrganizationId", OLD."applicantUserId", OLD."referencedProjectId") THEN
          RAISE EXCEPTION 'Submitted application snapshots are immutable';
        END IF;
        IF TG_TABLE_NAME = 'application_answers' AND (NEW."questionKey", NEW."answer", NEW."attachmentIds") IS DISTINCT FROM (OLD."questionKey", OLD."answer", OLD."attachmentIds") THEN
          RAISE EXCEPTION 'Submitted application answers are immutable';
        END IF;
        IF TG_TABLE_NAME = 'funding_offers' AND (NEW."conditionsSnapshot", NEW."sourceSnapshot", NEW."sourceVersion", NEW."amount", NEW."asset", NEW."supportDescription", NEW."supportType", NEW."restrictedPurpose") IS DISTINCT FROM (OLD."conditionsSnapshot", OLD."sourceSnapshot", OLD."sourceVersion", OLD."amount", OLD."asset", OLD."supportDescription", OLD."supportType", OLD."restrictedPurpose") THEN
          RAISE EXCEPTION 'Submitted funding offer terms are immutable';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await queryRunner.query(
      `CREATE TRIGGER "TR_applications_snapshot_immutable" BEFORE UPDATE ON "applications" FOR EACH ROW EXECUTE FUNCTION "reject_submission_snapshot_update"()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TR_application_answers_immutable" BEFORE UPDATE ON "application_answers" FOR EACH ROW EXECUTE FUNCTION "reject_submission_snapshot_update"()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TR_funding_offers_snapshot_immutable" BEFORE UPDATE ON "funding_offers" FOR EACH ROW EXECUTE FUNCTION "reject_submission_snapshot_update"()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "funding_offers"');
    await queryRunner.query('DROP TABLE "application_answers"');
    await queryRunner.query('DROP TABLE "applications"');
    await queryRunner.query(
      'DROP FUNCTION "reject_submission_snapshot_update"()',
    );
  }
}
