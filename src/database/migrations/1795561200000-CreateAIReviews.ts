import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAIReviews1795561200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ai_review_consents" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "applicationId" uuid NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "policyVersion" varchar(32) NOT NULL,
        "retentionDays" integer NOT NULL CHECK ("retentionDays" BETWEEN 1 AND 365),
        "grantedAt" timestamptz NOT NULL DEFAULT now(),
        "retentionUntil" timestamptz NOT NULL,
        "withdrawnAt" timestamptz,
        CONSTRAINT "CK_ai_review_consents_retention" CHECK ("retentionUntil" > "grantedAt")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_ai_review_consents_active" ON "ai_review_consents" ("applicationId", "userId") WHERE "withdrawnAt" IS NULL
    `);
    await queryRunner.query(`
      CREATE TABLE "ai_reviews" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "applicationId" uuid NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
        "consentId" uuid NOT NULL REFERENCES "ai_review_consents"("id") ON DELETE CASCADE,
        "modelProvider" varchar(80) NOT NULL,
        "modelName" varchar(120) NOT NULL,
        "modelVersion" varchar(80) NOT NULL,
        "promptVersion" varchar(80) NOT NULL,
        "citedSources" jsonb NOT NULL CHECK (jsonb_typeof("citedSources") = 'array' AND jsonb_array_length("citedSources") > 0),
        "uncertaintyFlags" text[] NOT NULL DEFAULT '{}',
        "advisoryOutput" jsonb NOT NULL CHECK (
          jsonb_typeof("advisoryOutput") = 'object'
          AND "advisoryOutput" ?& ARRAY['summary', 'observations']
          AND "advisoryOutput" - 'summary' - 'observations' = '{}'::jsonb
          AND jsonb_typeof("advisoryOutput"->'summary') = 'string'
          AND jsonb_typeof("advisoryOutput"->'observations') = 'array'
        ),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "retentionUntil" timestamptz NOT NULL,
        CONSTRAINT "CK_ai_reviews_retention" CHECK ("retentionUntil" > "createdAt")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_reviews_application_created" ON "ai_reviews" ("applicationId", "createdAt" DESC)`,
    );
    await queryRunner.query(`
      CREATE FUNCTION "reject_ai_review_update"() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'AI review outputs are immutable';
      END;
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TR_ai_reviews_immutable" BEFORE UPDATE ON "ai_reviews"
      FOR EACH ROW EXECUTE FUNCTION "reject_ai_review_update"()
    `);
    await queryRunner.query(`
      CREATE FUNCTION "reject_ai_review_consent_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF (NEW."applicationId", NEW."userId", NEW."policyVersion", NEW."retentionDays", NEW."grantedAt", NEW."retentionUntil") IS DISTINCT FROM (OLD."applicationId", OLD."userId", OLD."policyVersion", OLD."retentionDays", OLD."grantedAt", OLD."retentionUntil") THEN
          RAISE EXCEPTION 'AI review consent facts are immutable';
        END IF;
        IF OLD."withdrawnAt" IS NOT NULL AND NEW."withdrawnAt" IS DISTINCT FROM OLD."withdrawnAt" THEN
          RAISE EXCEPTION 'Withdrawn AI review consent cannot be restored';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TR_ai_review_consents_immutable" BEFORE UPDATE ON "ai_review_consents"
      FOR EACH ROW EXECUTE FUNCTION "reject_ai_review_consent_mutation"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TRIGGER "TR_ai_review_consents_immutable" ON "ai_review_consents"',
    );
    await queryRunner.query(
      'DROP FUNCTION "reject_ai_review_consent_mutation"()',
    );
    await queryRunner.query(
      'DROP TRIGGER "TR_ai_reviews_immutable" ON "ai_reviews"',
    );
    await queryRunner.query('DROP FUNCTION "reject_ai_review_update"()');
    await queryRunner.query('DROP TABLE "ai_reviews"');
    await queryRunner.query('DROP TABLE "ai_review_consents"');
  }
}
