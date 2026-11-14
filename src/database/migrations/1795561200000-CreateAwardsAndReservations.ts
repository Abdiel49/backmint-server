import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAwardsAndReservations1795561200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "reject_submission_snapshot_update"() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_TABLE_NAME = 'applications' THEN
          IF (NEW."sourceSnapshot", NEW."applicantSnapshot", NEW."proposalSnapshot", NEW."sourceVersion", NEW."applicantKey", NEW."applicantOrganizationId", NEW."applicantUserId", NEW."referencedProjectId") IS DISTINCT FROM (OLD."sourceSnapshot", OLD."applicantSnapshot", OLD."proposalSnapshot", OLD."sourceVersion", OLD."applicantKey", OLD."applicantOrganizationId", OLD."applicantUserId", OLD."referencedProjectId") THEN
            RAISE EXCEPTION 'Submitted application snapshots are immutable';
          END IF;
        ELSIF TG_TABLE_NAME = 'application_answers' THEN
          IF (NEW."questionKey", NEW."answer", NEW."attachmentIds") IS DISTINCT FROM (OLD."questionKey", OLD."answer", OLD."attachmentIds") THEN
            RAISE EXCEPTION 'Submitted application answers are immutable';
          END IF;
        ELSIF TG_TABLE_NAME = 'funding_offers' THEN
          IF (NEW."conditionsSnapshot", NEW."sourceSnapshot", NEW."sourceVersion", NEW."amount", NEW."asset", NEW."supportDescription", NEW."supportType", NEW."restrictedPurpose") IS DISTINCT FROM (OLD."conditionsSnapshot", OLD."sourceSnapshot", OLD."sourceVersion", OLD."amount", OLD."asset", OLD."supportDescription", OLD."supportType", OLD."restrictedPurpose") THEN
            RAISE EXCEPTION 'Submitted funding offer terms are immutable';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$;
      DO $$
      DECLARE status_constraint text;
      BEGIN
        FOR status_constraint IN
          SELECT constraint_row.conname
          FROM pg_constraint constraint_row
          WHERE constraint_row.conrelid = '"funding_offers"'::regclass
            AND constraint_row.contype = 'c'
            AND pg_get_constraintdef(constraint_row.oid) ILIKE '%status%'
        LOOP
          EXECUTE format('ALTER TABLE "funding_offers" DROP CONSTRAINT %I', status_constraint);
        END LOOP;
      END;
      $$;
      ALTER TABLE "funding_offers" ADD CONSTRAINT "CK_funding_offers_status" CHECK ("status" IN ('Submitted', 'UnderReview', 'Accepted', 'Declined', 'Withdrawn', 'Awarded'));
      CREATE TABLE "awards" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "sourceType" varchar(16) NOT NULL CHECK ("sourceType" IN ('Project', 'Call')),
        "sourceId" uuid NOT NULL,
        "applicationId" uuid REFERENCES "applications"("id") ON DELETE RESTRICT,
        "fundingOfferId" uuid REFERENCES "funding_offers"("id") ON DELETE RESTRICT,
        "recipientOrganizationId" uuid REFERENCES "organizations"("id") ON DELETE RESTRICT,
        "recipientUserId" uuid REFERENCES "users"("id") ON DELETE RESTRICT,
        "allocation" numeric(78, 0) NOT NULL CHECK ("allocation" > 0),
        "asset" varchar(128) NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "state" varchar(16) NOT NULL DEFAULT 'Offered' CHECK ("state" IN ('Offered', 'Accepted', 'Declined', 'Expired')),
        "termsSnapshot" jsonb NOT NULL,
        "acceptedAt" timestamptz,
        "releasedAt" timestamptz,
        CONSTRAINT "CK_awards_source_submission" CHECK (("applicationId" IS NOT NULL) <> ("fundingOfferId" IS NOT NULL)),
        CONSTRAINT "CK_awards_recipient" CHECK (("recipientOrganizationId" IS NOT NULL) <> ("recipientUserId" IS NOT NULL)),
        CONSTRAINT "CK_awards_release_state" CHECK (("state" IN ('Declined', 'Expired') AND "releasedAt" IS NOT NULL) OR ("state" IN ('Offered', 'Accepted') AND "releasedAt" IS NULL)),
        CONSTRAINT "CK_awards_acceptance" CHECK (("state" = 'Accepted' AND "acceptedAt" IS NOT NULL) OR ("state" <> 'Accepted' OR "acceptedAt" IS NOT NULL))
      );
      CREATE UNIQUE INDEX "UQ_awards_application" ON "awards" ("applicationId") WHERE "applicationId" IS NOT NULL;
      CREATE UNIQUE INDEX "UQ_awards_funding_offer" ON "awards" ("fundingOfferId") WHERE "fundingOfferId" IS NOT NULL;
      CREATE INDEX "IDX_awards_source_state" ON "awards" ("sourceType", "sourceId", "state");
      CREATE FUNCTION "reject_award_terms_update"() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF (NEW."sourceType", NEW."sourceId", NEW."applicationId", NEW."fundingOfferId", NEW."recipientOrganizationId", NEW."recipientUserId", NEW."allocation", NEW."asset", NEW."expiresAt", NEW."termsSnapshot") IS DISTINCT FROM (OLD."sourceType", OLD."sourceId", OLD."applicationId", OLD."fundingOfferId", OLD."recipientOrganizationId", OLD."recipientUserId", OLD."allocation", OLD."asset", OLD."expiresAt", OLD."termsSnapshot") THEN
          RAISE EXCEPTION 'Award terms are immutable';
        END IF;
        IF OLD."releasedAt" IS NOT NULL AND NEW."releasedAt" IS DISTINCT FROM OLD."releasedAt" THEN
          RAISE EXCEPTION 'Award reservation release is immutable';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER "TR_awards_terms_immutable" BEFORE UPDATE ON "awards" FOR EACH ROW EXECUTE FUNCTION "reject_award_terms_update"();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE "awards"; DROP FUNCTION "reject_award_terms_update"();`,
    );
    await queryRunner.query(
      `ALTER TABLE "funding_offers" DROP CONSTRAINT "CK_funding_offers_status"; ALTER TABLE "funding_offers" ADD CONSTRAINT "funding_offers_status_check" CHECK ("status" IN ('Submitted', 'UnderReview', 'Accepted', 'Declined', 'Withdrawn'));`,
    );
  }
}
