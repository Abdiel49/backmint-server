import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApplicationResubmissionLineage1795651200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "applications"
        ADD COLUMN "supersedesApplicationId" uuid,
        ADD CONSTRAINT "FK_applications_supersedes" FOREIGN KEY ("supersedesApplicationId") REFERENCES "applications"("id") ON DELETE RESTRICT;
      CREATE UNIQUE INDEX "UQ_applications_single_resubmission" ON "applications" ("supersedesApplicationId") WHERE "supersedesApplicationId" IS NOT NULL;
      CREATE OR REPLACE FUNCTION "reject_submission_snapshot_update"() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_TABLE_NAME = 'applications' THEN
          IF (NEW."sourceSnapshot", NEW."applicantSnapshot", NEW."proposalSnapshot", NEW."sourceVersion", NEW."applicantKey", NEW."applicantOrganizationId", NEW."applicantUserId", NEW."referencedProjectId", NEW."supersedesApplicationId") IS DISTINCT FROM (OLD."sourceSnapshot", OLD."applicantSnapshot", OLD."proposalSnapshot", OLD."sourceVersion", OLD."applicantKey", OLD."applicantOrganizationId", OLD."applicantUserId", OLD."referencedProjectId", OLD."supersedesApplicationId") THEN
            RAISE EXCEPTION 'Submitted application snapshots and lineage are immutable';
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
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "UQ_applications_single_resubmission";
      ALTER TABLE "applications" DROP CONSTRAINT "FK_applications_supersedes", DROP COLUMN "supersedesApplicationId";
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
    `);
  }
}
