import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateHumanEvaluations1795388400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "evaluation_rounds" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "sourceType" varchar(16) NOT NULL CHECK ("sourceType" IN ('Project', 'Call')),
        "sourceId" uuid NOT NULL,
        "stage" varchar(48) NOT NULL,
        "rubricVersion" integer NOT NULL CHECK ("rubricVersion" > 0),
        "rubric" jsonb NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'Open' CHECK ("status" IN ('Open', 'Closed')),
        "createdByUserId" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_evaluation_rounds_source_stage_rubric" UNIQUE ("sourceType", "sourceId", "stage", "rubricVersion")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "evaluation_assignments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "roundId" uuid NOT NULL REFERENCES "evaluation_rounds"("id") ON DELETE RESTRICT,
        "evaluatorUserId" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "applicationId" uuid REFERENCES "applications"("id") ON DELETE RESTRICT,
        "fundingOfferId" uuid REFERENCES "funding_offers"("id") ON DELETE RESTRICT,
        "conflictStatus" varchar(24) NOT NULL DEFAULT 'Undeclared' CHECK ("conflictStatus" IN ('Undeclared', 'NoConflict', 'Declared')),
        "conflictReason" text,
        "conflictDeclaredAt" timestamptz,
        "status" varchar(16) NOT NULL DEFAULT 'Assigned' CHECK ("status" IN ('Assigned', 'InProgress', 'Conflicted', 'Submitted', 'Revoked')),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CK_evaluation_assignment_submission" CHECK (("applicationId" IS NOT NULL) <> ("fundingOfferId" IS NOT NULL)),
        CONSTRAINT "CK_evaluation_assignment_conflict" CHECK (("conflictStatus" = 'Undeclared' AND "conflictDeclaredAt" IS NULL AND "conflictReason" IS NULL) OR ("conflictStatus" = 'NoConflict' AND "conflictDeclaredAt" IS NOT NULL AND "conflictReason" IS NULL) OR ("conflictStatus" = 'Declared' AND "conflictDeclaredAt" IS NOT NULL AND NULLIF(trim("conflictReason"), '') IS NOT NULL))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_evaluation_assignments_round_application_reviewer" ON "evaluation_assignments" ("roundId", "applicationId", "evaluatorUserId") WHERE "applicationId" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_evaluation_assignments_round_funding_offer_reviewer" ON "evaluation_assignments" ("roundId", "fundingOfferId", "evaluatorUserId") WHERE "fundingOfferId" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_evaluation_assignments_reviewer_status" ON "evaluation_assignments" ("evaluatorUserId", "status")`,
    );
    await queryRunner.query(`
      CREATE FUNCTION "protect_evaluation_round_and_conflict"() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_TABLE_NAME = 'evaluation_rounds' AND (NEW."sourceType", NEW."sourceId", NEW."stage", NEW."rubricVersion", NEW."rubric", NEW."createdByUserId") IS DISTINCT FROM (OLD."sourceType", OLD."sourceId", OLD."stage", OLD."rubricVersion", OLD."rubric", OLD."createdByUserId") THEN
          RAISE EXCEPTION 'Evaluation round rubric and identity are immutable';
        END IF;
        IF TG_TABLE_NAME = 'evaluation_assignments' AND (NEW."evaluatorUserId", NEW."applicationId", NEW."fundingOfferId", NEW."roundId") IS DISTINCT FROM (OLD."evaluatorUserId", OLD."applicationId", OLD."fundingOfferId", OLD."roundId") THEN
          RAISE EXCEPTION 'Evaluation assignment identity is immutable';
        END IF;
        IF TG_TABLE_NAME = 'evaluation_assignments' AND OLD."conflictStatus" <> 'Undeclared' AND (NEW."conflictStatus", NEW."conflictReason", NEW."conflictDeclaredAt") IS DISTINCT FROM (OLD."conflictStatus", OLD."conflictReason", OLD."conflictDeclaredAt") THEN
          RAISE EXCEPTION 'Evaluation conflict declaration is immutable';
        END IF;
        IF TG_TABLE_NAME = 'evaluation_assignments' AND OLD."conflictStatus" = 'Undeclared' AND NEW."conflictStatus" NOT IN ('Undeclared', 'NoConflict', 'Declared') THEN
          RAISE EXCEPTION 'Evaluation conflict declaration transition is invalid';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await queryRunner.query(
      `CREATE TRIGGER "TR_evaluation_round_immutable" BEFORE UPDATE ON "evaluation_rounds" FOR EACH ROW EXECUTE FUNCTION "protect_evaluation_round_and_conflict"()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TR_evaluation_conflict_immutable" BEFORE UPDATE ON "evaluation_assignments" FOR EACH ROW EXECUTE FUNCTION "protect_evaluation_round_and_conflict"()`,
    );
    await queryRunner.query(`
      CREATE TABLE "evaluations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "assignmentId" uuid NOT NULL REFERENCES "evaluation_assignments"("id") ON DELETE RESTRICT,
        "version" integer NOT NULL CHECK ("version" > 0),
        "findings" jsonb NOT NULL,
        "rubricScores" jsonb NOT NULL,
        "eligibilityDecision" varchar(32) NOT NULL CHECK ("eligibilityDecision" IN ('Eligible', 'NeedsReview', 'Ineligible', 'MissingInformation')),
        "deterministicEligibility" jsonb,
        "recommendation" varchar(32) NOT NULL CHECK ("recommendation" IN ('Recommend', 'DoNotRecommend', 'NeedsDiscussion', 'NoRecommendation')),
        "notes" text NOT NULL CHECK (length(trim("notes")) > 0),
        "submittedByUserId" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "submittedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_evaluations_assignment_version" UNIQUE ("assignmentId", "version")
      )
    `);
    await queryRunner.query(`
      CREATE FUNCTION "reject_evaluation_history_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'Evaluation audit history is immutable';
      END;
      $$
    `);
    await queryRunner.query(
      `CREATE TRIGGER "TR_evaluations_immutable" BEFORE UPDATE OR DELETE ON "evaluations" FOR EACH ROW EXECUTE FUNCTION "reject_evaluation_history_mutation"()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "evaluations"');
    await queryRunner.query('DROP TABLE "evaluation_assignments"');
    await queryRunner.query('DROP TABLE "evaluation_rounds"');
    await queryRunner.query(
      'DROP FUNCTION "protect_evaluation_round_and_conflict"',
    );
    await queryRunner.query(
      'DROP FUNCTION "reject_evaluation_history_mutation"',
    );
  }
}
