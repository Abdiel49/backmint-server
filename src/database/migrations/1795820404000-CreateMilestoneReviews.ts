import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMilestoneReviews1795820404000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "milestone_reviews" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "milestoneId" uuid NOT NULL REFERENCES "milestones"("id") ON DELETE RESTRICT,
        "evidenceVersion" integer NOT NULL CHECK ("evidenceVersion" > 0),
        "reviewerUserId" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "verdict" varchar(24) NOT NULL CHECK ("verdict" IN ('Approved', 'Rejected', 'ChangesRequested')),
        "notes" varchar(1000) NOT NULL CHECK (btrim("notes") <> ''),
        "evidenceHash" varchar(64) NOT NULL CHECK ("evidenceHash" ~ '^[a-f0-9]{64}$'),
        "decidedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_milestone_reviews_evidence_version" UNIQUE ("milestoneId", "evidenceVersion")
      );
      CREATE FUNCTION reject_immutable_milestone_review() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'Milestone review records are immutable';
      END;
      $$;
      CREATE TRIGGER "TR_milestone_reviews_immutable" BEFORE UPDATE OR DELETE ON "milestone_reviews"
        FOR EACH ROW EXECUTE FUNCTION reject_immutable_milestone_review();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE "milestone_reviews";
      DROP FUNCTION "reject_immutable_milestone_review"();
    `);
  }
}
