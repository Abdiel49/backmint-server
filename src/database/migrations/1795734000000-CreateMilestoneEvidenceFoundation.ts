import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMilestoneEvidenceFoundation1795734000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "milestones" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "awardId" uuid NOT NULL REFERENCES "awards"("id") ON DELETE RESTRICT,
        "sequence" integer NOT NULL CHECK ("sequence" > 0),
        "currentTermsVersion" integer NOT NULL DEFAULT 0 CHECK ("currentTermsVersion" >= 0),
        "stateVersion" integer NOT NULL DEFAULT 1 CHECK ("stateVersion" > 0),
        "status" varchar(24) NOT NULL DEFAULT 'Pending' CHECK ("status" IN ('Pending', 'Ready', 'Submitted', 'UnderReview', 'Approved', 'ReleasePending', 'Paid', 'ChangesRequested', 'Resubmitted', 'Rejected', 'Disputed')),
        "reviewerUserId" uuid REFERENCES "users"("id") ON DELETE RESTRICT,
        "onChainMilestoneId" varchar(128),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_milestones_award_sequence" UNIQUE ("awardId", "sequence")
      );
      CREATE TABLE "milestone_terms_versions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "milestoneId" uuid NOT NULL REFERENCES "milestones"("id") ON DELETE RESTRICT,
        "version" integer NOT NULL CHECK ("version" > 0),
        "acceptanceCriteria" jsonb NOT NULL CHECK (jsonb_typeof("acceptanceCriteria") = 'object'),
        "amount" numeric(78, 0) NOT NULL CHECK ("amount" > 0),
        "dueAt" timestamptz,
        "reviewerUserId" uuid REFERENCES "users"("id") ON DELETE RESTRICT,
        "createdByUserId" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_milestone_terms_version" UNIQUE ("milestoneId", "version")
      );
      CREATE TABLE "evidence_submissions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "milestoneId" uuid NOT NULL REFERENCES "milestones"("id") ON DELETE RESTRICT,
        "version" integer NOT NULL CHECK ("version" > 0),
        "submittedByUserId" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "status" varchar(24) NOT NULL DEFAULT 'Submitted' CHECK ("status" IN ('Submitted', 'Withdrawn', 'ChangesRequested', 'Superseded')),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_evidence_submissions_milestone_version" UNIQUE ("milestoneId", "version")
      );
      CREATE TABLE "evidence_assets" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "evidenceSubmissionId" uuid NOT NULL REFERENCES "evidence_submissions"("id") ON DELETE RESTRICT,
        "storageKey" varchar(512) NOT NULL UNIQUE CHECK (btrim("storageKey") <> '' AND "storageKey" !~* '^https?://' AND "storageKey" !~ '(^|/)\\.\\.?(/|$)'),
        "checksumSha256" varchar(64) NOT NULL CHECK ("checksumSha256" ~ '^[a-f0-9]{64}$'),
        "mimeType" varchar(255) NOT NULL CHECK ("mimeType" ~ '^[A-Za-z0-9.+_-]+/[A-Za-z0-9.+_-]+$'),
        "sizeBytes" bigint NOT NULL CHECK ("sizeBytes" > 0),
        "visibility" varchar(16) NOT NULL DEFAULT 'Private' CHECK ("visibility" = 'Private'),
        "scanStatus" varchar(16) NOT NULL DEFAULT 'Pending' CHECK ("scanStatus" IN ('Pending', 'Passed', 'Quarantined')),
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "IDX_milestone_terms_current" ON "milestone_terms_versions" ("milestoneId", "version");
      CREATE INDEX "IDX_evidence_submissions_milestone_created" ON "evidence_submissions" ("milestoneId", "createdAt");
      CREATE INDEX "IDX_evidence_assets_scan_status" ON "evidence_assets" ("scanStatus", "createdAt");
      CREATE FUNCTION guard_milestone_terms_version() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE current_version integer;
      DECLARE previous_amount numeric(78, 0);
      DECLARE current_total numeric(78, 0);
      DECLARE award_limit numeric(78, 0);
      DECLARE award_id uuid;
      BEGIN
        SELECT milestone."awardId", milestone."currentTermsVersion"
          INTO award_id, current_version
          FROM "milestones" milestone
          WHERE milestone."id" = NEW."milestoneId"
          FOR UPDATE;
        IF NOT FOUND OR NEW."version" <> current_version + 1 THEN
          RAISE EXCEPTION 'Milestone terms version must increase by exactly one';
        END IF;
        SELECT award."allocation" INTO award_limit FROM "awards" award WHERE award."id" = award_id FOR UPDATE;
        SELECT COALESCE(SUM(current_terms."amount"), 0) INTO current_total
          FROM "milestones" milestone
          JOIN "milestone_terms_versions" current_terms
            ON current_terms."milestoneId" = milestone."id"
            AND current_terms."version" = milestone."currentTermsVersion"
          WHERE milestone."awardId" = award_id;
        IF current_version > 0 THEN
          SELECT "amount" INTO previous_amount FROM "milestone_terms_versions"
            WHERE "milestoneId" = NEW."milestoneId" AND "version" = current_version;
        ELSE
          previous_amount := 0;
        END IF;
        IF current_total - COALESCE(previous_amount, 0) + NEW."amount" > award_limit THEN
          RAISE EXCEPTION 'Milestone allocations exceed Award allocation';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE FUNCTION set_milestone_terms_version() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        UPDATE "milestones" SET "currentTermsVersion" = NEW."version", "updatedAt" = now()
          WHERE "id" = NEW."milestoneId";
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER "TR_milestone_terms_version_validate" BEFORE INSERT ON "milestone_terms_versions"
        FOR EACH ROW EXECUTE FUNCTION guard_milestone_terms_version();
      CREATE TRIGGER "TR_milestone_terms_version_current" AFTER INSERT ON "milestone_terms_versions"
        FOR EACH ROW EXECUTE FUNCTION set_milestone_terms_version();
      CREATE FUNCTION reject_immutable_milestone_record() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION '% records are immutable', TG_TABLE_NAME;
      END;
      $$;
      CREATE TRIGGER "TR_milestone_terms_immutable" BEFORE UPDATE OR DELETE ON "milestone_terms_versions"
        FOR EACH ROW EXECUTE FUNCTION reject_immutable_milestone_record();
      CREATE TRIGGER "TR_evidence_submission_immutable" BEFORE UPDATE OR DELETE ON "evidence_submissions"
        FOR EACH ROW EXECUTE FUNCTION reject_immutable_milestone_record();
      CREATE FUNCTION guard_milestone_update() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW."id" <> OLD."id" OR NEW."awardId" <> OLD."awardId" OR NEW."sequence" <> OLD."sequence"
          OR NOT (
            (NEW."currentTermsVersion" = OLD."currentTermsVersion" + 1 AND NEW."stateVersion" = OLD."stateVersion" AND NEW."status" = OLD."status" AND EXISTS (SELECT 1 FROM "milestone_terms_versions" WHERE "milestoneId" = NEW."id" AND "version" = NEW."currentTermsVersion")) OR
            (NEW."currentTermsVersion" = OLD."currentTermsVersion" AND NEW."stateVersion" = OLD."stateVersion" + 1 AND (
            (OLD."status" = 'Pending' AND NEW."status" IN ('Ready', 'Disputed')) OR
            (OLD."status" = 'Ready' AND NEW."status" IN ('Submitted', 'Disputed')) OR
            (OLD."status" = 'Submitted' AND NEW."status" IN ('UnderReview', 'Disputed')) OR
            (OLD."status" = 'UnderReview' AND NEW."status" IN ('Approved', 'ChangesRequested', 'Rejected', 'Disputed')) OR
            (OLD."status" = 'Approved' AND NEW."status" IN ('ReleasePending', 'Disputed')) OR
            (OLD."status" = 'ReleasePending' AND NEW."status" IN ('Paid', 'Disputed')) OR
            (OLD."status" = 'ChangesRequested' AND NEW."status" IN ('Resubmitted', 'Disputed')) OR
            (OLD."status" = 'Resubmitted' AND NEW."status" IN ('UnderReview', 'Disputed')) OR
            (OLD."status" = 'Rejected' AND NEW."status" = 'Disputed')
            ))
          ) THEN
          RAISE EXCEPTION 'Milestone update is not an allowed versioned state transition';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER "TR_milestones_guard_update" BEFORE UPDATE ON "milestones"
        FOR EACH ROW EXECUTE FUNCTION guard_milestone_update();
      CREATE FUNCTION guard_evidence_asset_update() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'DELETE' OR NEW."id" <> OLD."id"
          OR NEW."evidenceSubmissionId" <> OLD."evidenceSubmissionId"
          OR NEW."storageKey" <> OLD."storageKey"
          OR NEW."checksumSha256" <> OLD."checksumSha256"
          OR NEW."mimeType" <> OLD."mimeType"
          OR NEW."sizeBytes" <> OLD."sizeBytes"
          OR NEW."visibility" <> 'Private'
          OR NOT ((OLD."scanStatus" = 'Pending' AND NEW."scanStatus" IN ('Passed', 'Quarantined')))
        THEN
          RAISE EXCEPTION 'Evidence asset metadata is immutable or scan transition is invalid';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER "TR_evidence_assets_guard_update" BEFORE UPDATE OR DELETE ON "evidence_assets"
        FOR EACH ROW EXECUTE FUNCTION guard_evidence_asset_update();
      CREATE FUNCTION guard_evidence_submission_version() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE current_version integer;
      BEGIN
        PERFORM 1 FROM "milestones" WHERE "id" = NEW."milestoneId" FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Evidence submission milestone does not exist';
        END IF;
        SELECT COALESCE(MAX("version"), 0) INTO current_version FROM "evidence_submissions"
          WHERE "milestoneId" = NEW."milestoneId";
        IF NEW."version" <> current_version + 1 THEN
          RAISE EXCEPTION 'Evidence version must increase by exactly one';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER "TR_evidence_submission_version" BEFORE INSERT ON "evidence_submissions"
        FOR EACH ROW EXECUTE FUNCTION guard_evidence_submission_version();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE "evidence_assets";
      DROP TABLE "evidence_submissions";
      DROP TABLE "milestone_terms_versions";
      DROP TABLE "milestones";
      DROP FUNCTION "guard_evidence_submission_version"();
      DROP FUNCTION "guard_evidence_asset_update"();
      DROP FUNCTION "guard_milestone_update"();
      DROP FUNCTION "reject_immutable_milestone_record"();
      DROP FUNCTION "set_milestone_terms_version"();
      DROP FUNCTION "guard_milestone_terms_version"();
    `);
  }
}
