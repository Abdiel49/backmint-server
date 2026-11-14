import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMilestoneEvidenceScanLifecycle1795820405000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "evidence_submissions"
        DROP CONSTRAINT "evidence_submissions_status_check";
      ALTER TABLE "evidence_submissions"
        ADD CONSTRAINT "CK_evidence_submissions_status"
        CHECK ("status" IN ('PendingUpload', 'Scanning', 'Submitted', 'Quarantined', 'Withdrawn', 'ChangesRequested', 'Superseded'));
      DROP TRIGGER "TR_evidence_submission_immutable" ON "evidence_submissions";
      CREATE FUNCTION guard_evidence_submission_transition() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'DELETE'
          OR NEW."id" <> OLD."id"
          OR NEW."milestoneId" <> OLD."milestoneId"
          OR NEW."version" <> OLD."version"
          OR NEW."submittedByUserId" <> OLD."submittedByUserId"
          OR NEW."createdAt" <> OLD."createdAt"
          OR NOT (
            (OLD."status" = 'PendingUpload' AND NEW."status" IN ('PendingUpload', 'Scanning', 'Quarantined')) OR
            (OLD."status" = 'Scanning' AND NEW."status" IN ('Scanning', 'Submitted', 'Quarantined'))
          )
        THEN
          RAISE EXCEPTION 'Evidence submission metadata is immutable or scan transition is invalid';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER "TR_evidence_submission_transition" BEFORE UPDATE OR DELETE ON "evidence_submissions"
        FOR EACH ROW EXECUTE FUNCTION guard_evidence_submission_transition();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER "TR_evidence_submission_transition" ON "evidence_submissions";
      DROP FUNCTION "guard_evidence_submission_transition"();
      UPDATE "evidence_submissions" SET "status" = 'Submitted'
        WHERE "status" IN ('PendingUpload', 'Scanning', 'Quarantined');
      ALTER TABLE "evidence_submissions" DROP CONSTRAINT "CK_evidence_submissions_status";
      ALTER TABLE "evidence_submissions"
        ADD CONSTRAINT "evidence_submissions_status_check"
        CHECK ("status" IN ('Submitted', 'Withdrawn', 'ChangesRequested', 'Superseded'));
      CREATE TRIGGER "TR_evidence_submission_immutable" BEFORE UPDATE OR DELETE ON "evidence_submissions"
        FOR EACH ROW EXECUTE FUNCTION reject_immutable_milestone_record();
    `);
  }
}
