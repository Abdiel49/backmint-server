import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProjectsCallsAndOpportunities1795042800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "projects" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "ownerOrganizationId" uuid REFERENCES "organizations"("id") ON DELETE RESTRICT,
        "ownerUserId" uuid REFERENCES "users"("id") ON DELETE RESTRICT,
        "title" varchar(240) NOT NULL,
        "description" text NOT NULL,
        "direction" varchar(24) NOT NULL,
        "visibility" varchar(16) NOT NULL DEFAULT 'Private',
        "lifecycleStatus" varchar(16) NOT NULL DEFAULT 'Draft',
        "intakeStatus" varchar(16) NOT NULL DEFAULT 'Open',
        "fundingTargetAmount" numeric(78, 0),
        "targetAsset" varchar(128),
        "hardCapEnabled" boolean NOT NULL DEFAULT false,
        "hardCapAmount" numeric(78, 0),
        "intakeOpensAt" timestamptz,
        "intakeClosesAt" timestamptz,
        "publishedAt" timestamptz,
        "content" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "stateVersion" integer NOT NULL DEFAULT 1,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CK_projects_owner" CHECK ("ownerOrganizationId" IS NOT NULL OR "ownerUserId" IS NOT NULL),
        CONSTRAINT "CK_projects_direction" CHECK ("direction" IN ('FundingOffered', 'FundingRequested')),
        CONSTRAINT "CK_projects_visibility" CHECK ("visibility" IN ('Private', 'Unlisted', 'Public')),
        CONSTRAINT "CK_projects_lifecycle" CHECK ("lifecycleStatus" IN ('Draft', 'Published', 'Active', 'Completed', 'Cancelled', 'Archived')),
        CONSTRAINT "CK_projects_intake" CHECK ("intakeStatus" IN ('Open', 'Paused', 'Closed')),
        CONSTRAINT "CK_projects_amounts" CHECK (("fundingTargetAmount" IS NULL OR "fundingTargetAmount" >= 0) AND ("hardCapAmount" IS NULL OR "hardCapAmount" > 0)),
        CONSTRAINT "CK_projects_hard_cap" CHECK (NOT "hardCapEnabled" OR "hardCapAmount" IS NOT NULL),
        CONSTRAINT "CK_projects_intake_dates" CHECK ("intakeOpensAt" IS NULL OR "intakeClosesAt" IS NULL OR "intakeOpensAt" < "intakeClosesAt")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_projects_public_feed" ON "projects" ("visibility", "lifecycleStatus", "publishedAt")',
    );
    await queryRunner.query(`
      CREATE TABLE "project_versions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "projectId" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "version" integer NOT NULL CHECK ("version" > 0),
        "snapshot" jsonb NOT NULL,
        "reason" varchar(32) NOT NULL,
        "contentHash" char(64) NOT NULL,
        "publishedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_project_versions_number" UNIQUE ("projectId", "version")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "calls" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "ownerOrganizationId" uuid REFERENCES "organizations"("id") ON DELETE RESTRICT,
        "ownerUserId" uuid REFERENCES "users"("id") ON DELETE RESTRICT,
        "title" varchar(240) NOT NULL,
        "description" text NOT NULL,
        "direction" varchar(24) NOT NULL,
        "visibility" varchar(16) NOT NULL DEFAULT 'Private',
        "lifecycleStatus" varchar(16) NOT NULL DEFAULT 'Draft',
        "intakeStatus" varchar(16) NOT NULL DEFAULT 'Open',
        "fundingTargetAmount" numeric(78, 0),
        "targetAsset" varchar(128),
        "hardCapEnabled" boolean NOT NULL DEFAULT false,
        "hardCapAmount" numeric(78, 0),
        "maximumAwards" integer,
        "allocationMode" varchar(16),
        "fixedAwardAmount" numeric(78, 0),
        "overallBudget" numeric(78, 0),
        "intakeOpensAt" timestamptz,
        "intakeClosesAt" timestamptz,
        "publishedAt" timestamptz,
        "content" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "stateVersion" integer NOT NULL DEFAULT 1,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CK_calls_owner" CHECK ("ownerOrganizationId" IS NOT NULL OR "ownerUserId" IS NOT NULL),
        CONSTRAINT "CK_calls_direction" CHECK ("direction" IN ('FundingOffered', 'FundingRequested')),
        CONSTRAINT "CK_calls_visibility" CHECK ("visibility" IN ('Private', 'Unlisted', 'Public')),
        CONSTRAINT "CK_calls_lifecycle" CHECK ("lifecycleStatus" IN ('Draft', 'Published', 'Active', 'Completed', 'Cancelled', 'Archived')),
        CONSTRAINT "CK_calls_intake" CHECK ("intakeStatus" IN ('Open', 'Paused', 'Closed')),
        CONSTRAINT "CK_calls_awards" CHECK ("maximumAwards" IS NULL OR "maximumAwards" > 0),
        CONSTRAINT "CK_calls_budget" CHECK (("fixedAwardAmount" IS NULL OR "fixedAwardAmount" > 0) AND ("overallBudget" IS NULL OR "overallBudget" > 0)),
        CONSTRAINT "CK_calls_amounts" CHECK (("fundingTargetAmount" IS NULL OR "fundingTargetAmount" >= 0) AND ("hardCapAmount" IS NULL OR "hardCapAmount" > 0)),
        CONSTRAINT "CK_calls_hard_cap" CHECK (NOT "hardCapEnabled" OR "hardCapAmount" IS NOT NULL),
        CONSTRAINT "CK_calls_allocation" CHECK ("allocationMode" IS NULL OR "allocationMode" IN ('Single', 'Multiple', 'Limited')),
        CONSTRAINT "CK_calls_intake_dates" CHECK ("intakeOpensAt" IS NULL OR "intakeClosesAt" IS NULL OR "intakeOpensAt" < "intakeClosesAt")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_calls_public_feed" ON "calls" ("visibility", "lifecycleStatus", "publishedAt")',
    );
    await queryRunner.query(`
      CREATE TABLE "call_versions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "callId" uuid NOT NULL REFERENCES "calls"("id") ON DELETE CASCADE,
        "version" integer NOT NULL CHECK ("version" > 0),
        "snapshot" jsonb NOT NULL,
        "reason" varchar(32) NOT NULL,
        "contentHash" char(64) NOT NULL,
        "publishedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_call_versions_number" UNIQUE ("callId", "version")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "eligibility_rules" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "sourceType" varchar(16) NOT NULL CHECK ("sourceType" IN ('Project', 'Call')),
        "sourceId" uuid NOT NULL,
        "definition" jsonb NOT NULL,
        "ruleVersion" integer NOT NULL DEFAULT 1 CHECK ("ruleVersion" > 0),
        CONSTRAINT "UQ_eligibility_rules_version" UNIQUE ("sourceType", "sourceId", "ruleVersion")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "questionnaires" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "sourceType" varchar(16) NOT NULL CHECK ("sourceType" IN ('Project', 'Call')),
        "sourceId" uuid NOT NULL,
        "version" integer NOT NULL CHECK ("version" > 0),
        CONSTRAINT "UQ_questionnaires_version" UNIQUE ("sourceType", "sourceId", "version")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "questions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "questionnaireId" uuid NOT NULL REFERENCES "questionnaires"("id") ON DELETE CASCADE,
        "questionKey" varchar(80) NOT NULL,
        "kind" varchar(24) NOT NULL CHECK ("kind" IN ('Text', 'LongText', 'Number', 'SingleChoice', 'MultipleChoice', 'Boolean')),
        "label" varchar(500) NOT NULL,
        "required" boolean NOT NULL DEFAULT false,
        "options" jsonb,
        "validation" jsonb,
        "displayOrder" integer NOT NULL CHECK ("displayOrder" >= 0),
        CONSTRAINT "UQ_questions_key" UNIQUE ("questionnaireId", "questionKey"),
        CONSTRAINT "UQ_questions_questionnaire_order" UNIQUE ("questionnaireId", "displayOrder")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "opportunity_policies" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "sourceType" varchar(16) NOT NULL CHECK ("sourceType" IN ('Project', 'Call')),
        "sourceId" uuid NOT NULL,
        "definition" jsonb NOT NULL,
        CONSTRAINT "UQ_opportunity_policies_source" UNIQUE ("sourceType", "sourceId")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "opportunity_policies"');
    await queryRunner.query('DROP TABLE "questions"');
    await queryRunner.query('DROP TABLE "questionnaires"');
    await queryRunner.query('DROP TABLE "eligibility_rules"');
    await queryRunner.query('DROP TABLE "call_versions"');
    await queryRunner.query('DROP TABLE "calls"');
    await queryRunner.query('DROP TABLE "project_versions"');
    await queryRunner.query('DROP TABLE "projects"');
  }
}
