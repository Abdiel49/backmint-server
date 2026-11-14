import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FixEvaluationTriggerFields1795906805000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "protect_evaluation_round_and_conflict"() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_TABLE_NAME = 'evaluation_rounds' THEN
          IF (NEW."sourceType", NEW."sourceId", NEW."stage", NEW."rubricVersion", NEW."rubric", NEW."createdByUserId") IS DISTINCT FROM (OLD."sourceType", OLD."sourceId", OLD."stage", OLD."rubricVersion", OLD."rubric", OLD."createdByUserId") THEN
            RAISE EXCEPTION 'Evaluation round rubric and identity are immutable';
          END IF;
        ELSIF TG_TABLE_NAME = 'evaluation_assignments' THEN
          IF (NEW."evaluatorUserId", NEW."applicationId", NEW."fundingOfferId", NEW."roundId") IS DISTINCT FROM (OLD."evaluatorUserId", OLD."applicationId", OLD."fundingOfferId", OLD."roundId") THEN
            RAISE EXCEPTION 'Evaluation assignment identity is immutable';
          END IF;
          IF OLD."conflictStatus" <> 'Undeclared' AND (NEW."conflictStatus", NEW."conflictReason", NEW."conflictDeclaredAt") IS DISTINCT FROM (OLD."conflictStatus", OLD."conflictReason", OLD."conflictDeclaredAt") THEN
            RAISE EXCEPTION 'Evaluation conflict declaration is immutable';
          END IF;
          IF OLD."conflictStatus" = 'Undeclared' AND NEW."conflictStatus" NOT IN ('Undeclared', 'NoConflict', 'Declared') THEN
            RAISE EXCEPTION 'Evaluation conflict declaration transition is invalid';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "protect_evaluation_round_and_conflict"() RETURNS trigger LANGUAGE plpgsql AS $$
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
  }
}
