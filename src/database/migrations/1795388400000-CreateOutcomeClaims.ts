import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOutcomeClaims1795388400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "outcome_claims" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "sourceType" varchar(24) NOT NULL CHECK ("sourceType" IN ('Project', 'Call')),
        "sourceId" uuid NOT NULL,
        "claimedByUserId" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "metricType" varchar(64) NOT NULL,
        "value" varchar(96) NOT NULL CHECK ("value" ~ '^-?(0|[1-9][0-9]{0,63})(\\.[0-9]{1,24})?$'),
        "unit" varchar(32) NOT NULL,
        "evidenceStorageKey" varchar(512) NOT NULL,
        "evidenceSha256" varchar(64) NOT NULL CHECK ("evidenceSha256" ~ '^[a-f0-9]{64}$'),
        "provenance" varchar(24) NOT NULL DEFAULT 'SelfReported'
          CHECK ("provenance" IN ('SelfReported', 'Reviewed', 'IndependentlyVerified')),
        "verifierUserId" uuid REFERENCES "users"("id") ON DELETE RESTRICT,
        "verificationNote" varchar(1000),
        "verifiedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CK_outcome_claims_verification_consistency" CHECK (
          ("provenance" = 'SelfReported' AND "verifierUserId" IS NULL AND "verifiedAt" IS NULL)
          OR
          ("provenance" <> 'SelfReported' AND "verifierUserId" IS NOT NULL AND "verifiedAt" IS NOT NULL)
        ),
        CONSTRAINT "CK_outcome_claims_no_self_verification" CHECK (
          "verifierUserId" IS NULL OR "verifierUserId" <> "claimedByUserId"
        )
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_outcome_claims_source" ON "outcome_claims" ("sourceType", "sourceId", "createdAt")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_outcome_claims_claimant" ON "outcome_claims" ("claimedByUserId", "createdAt")',
    );
    await queryRunner.query(`
      CREATE FUNCTION guard_outcome_claim_update() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'Outcome claims cannot be deleted';
        END IF;
        IF OLD."provenance" <> 'SelfReported'
          OR NEW."provenance" NOT IN ('Reviewed', 'IndependentlyVerified')
          OR NEW."verifierUserId" IS NULL
          OR NEW."verificationNote" IS NULL
          OR NEW."verifiedAt" IS NULL
          OR NEW."id" <> OLD."id"
          OR NEW."sourceType" <> OLD."sourceType"
          OR NEW."sourceId" <> OLD."sourceId"
          OR NEW."claimedByUserId" <> OLD."claimedByUserId"
          OR NEW."metricType" <> OLD."metricType"
          OR NEW."value" <> OLD."value"
          OR NEW."unit" <> OLD."unit"
          OR NEW."evidenceStorageKey" <> OLD."evidenceStorageKey"
          OR NEW."evidenceSha256" <> OLD."evidenceSha256"
          OR NEW."createdAt" <> OLD."createdAt"
          OR NEW."verifierUserId" = OLD."claimedByUserId" THEN
          RAISE EXCEPTION 'Outcome claim update is not an allowed verification transition';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TR_outcome_claims_guard_update"
      BEFORE UPDATE OR DELETE ON "outcome_claims"
      FOR EACH ROW EXECUTE FUNCTION guard_outcome_claim_update()
    `);
    await queryRunner.query(`
      CREATE TABLE "outcome_claim_reviews" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "outcomeClaimId" uuid NOT NULL REFERENCES "outcome_claims"("id") ON DELETE RESTRICT,
        "reviewerUserId" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "provenance" varchar(24) NOT NULL CHECK ("provenance" IN ('Reviewed', 'IndependentlyVerified')),
        "note" varchar(1000) NOT NULL,
        "correlationId" varchar(128) NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_outcome_claim_reviews_claim" ON "outcome_claim_reviews" ("outcomeClaimId", "createdAt")',
    );
    await queryRunner.query(`
      CREATE FUNCTION reject_outcome_claim_review_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'Outcome claim reviews are immutable';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TR_outcome_claim_reviews_immutable"
      BEFORE UPDATE OR DELETE ON "outcome_claim_reviews"
      FOR EACH ROW EXECUTE FUNCTION reject_outcome_claim_review_mutation()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TRIGGER "TR_outcome_claim_reviews_immutable" ON "outcome_claim_reviews"');
    await queryRunner.query('DROP FUNCTION reject_outcome_claim_review_mutation()');
    await queryRunner.query('DROP TABLE "outcome_claim_reviews"');
    await queryRunner.query('DROP TRIGGER "TR_outcome_claims_guard_update" ON "outcome_claims"');
    await queryRunner.query('DROP FUNCTION guard_outcome_claim_update()');
    await queryRunner.query('DROP TABLE "outcome_claims"');
  }
}
