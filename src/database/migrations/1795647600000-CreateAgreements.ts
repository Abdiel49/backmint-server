import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAgreements1795647600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "agreements" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "awardId" uuid NOT NULL UNIQUE REFERENCES "awards"("id") ON DELETE RESTRICT,
        "status" varchar(24) NOT NULL DEFAULT 'Draft' CHECK ("status" IN ('Draft', 'PendingAcceptance', 'Accepted', 'AwaitingFunding', 'PartiallyFunded', 'Funded', 'Active', 'Completed', 'Cancelled', 'Disputed', 'Expired')),
        "currentVersion" integer NOT NULL DEFAULT 1 CHECK ("currentVersion" > 0),
        "createdByUserId" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE "agreement_versions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "agreementId" uuid NOT NULL REFERENCES "agreements"("id") ON DELETE RESTRICT,
        "version" integer NOT NULL CHECK ("version" > 0),
        "terms" jsonb NOT NULL,
        "economicTermsHash" varchar(64) NOT NULL CHECK ("economicTermsHash" ~ '^[a-f0-9]{64}$'),
        "termsHash" varchar(64) NOT NULL CHECK ("termsHash" ~ '^[a-f0-9]{64}$'),
        "versionNonce" uuid NOT NULL UNIQUE,
        "acceptanceExpiresAt" timestamptz NOT NULL,
        "contractArtifactReference" varchar(255) NOT NULL,
        "createdByUserId" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_agreement_versions_number" UNIQUE ("agreementId", "version")
      );
      CREATE TABLE "agreement_party_acceptances" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "agreementId" uuid NOT NULL REFERENCES "agreements"("id") ON DELETE RESTRICT,
        "version" integer NOT NULL,
        "partyKey" varchar(80) NOT NULL,
        "partyRole" varchar(24) NOT NULL CHECK ("partyRole" IN ('Funder', 'Recipient', 'Verifier')),
        "acceptedByUserId" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "acceptedTermsHash" varchar(64) NOT NULL CHECK ("acceptedTermsHash" ~ '^[a-f0-9]{64}$'),
        "acceptedAt" timestamptz NOT NULL,
        CONSTRAINT "FK_agreement_acceptance_version" FOREIGN KEY ("agreementId", "version") REFERENCES "agreement_versions"("agreementId", "version") ON DELETE RESTRICT,
        CONSTRAINT "UQ_agreement_acceptance_party_version" UNIQUE ("agreementId", "version", "partyKey")
      );
      CREATE TABLE "agreement_finance_confirmations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "agreementId" uuid NOT NULL REFERENCES "agreements"("id") ON DELETE RESTRICT,
        "chainOperationId" uuid NOT NULL UNIQUE REFERENCES "chain_operations"("id") ON DELETE RESTRICT,
        "status" varchar(16) NOT NULL CHECK ("status" IN ('PartiallyFunded', 'Funded')),
        "network" varchar(128) NOT NULL,
        "transactionHash" varchar(128) NOT NULL,
        "economicTermsHash" varchar(64) NOT NULL CHECK ("economicTermsHash" ~ '^[a-f0-9]{64}$'),
        "confirmedAt" timestamptz NOT NULL
      );
      CREATE INDEX "IDX_agreement_finance_confirmation_agreement" ON "agreement_finance_confirmations" ("agreementId", "id");
      CREATE FUNCTION "reject_agreement_immutable_record_update"() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'Agreement version, acceptance and finance confirmation records are immutable';
      END;
      $$;
      CREATE TRIGGER "TR_agreement_versions_immutable" BEFORE UPDATE OR DELETE ON "agreement_versions" FOR EACH ROW EXECUTE FUNCTION "reject_agreement_immutable_record_update"();
      CREATE TRIGGER "TR_agreement_acceptances_immutable" BEFORE UPDATE OR DELETE ON "agreement_party_acceptances" FOR EACH ROW EXECUTE FUNCTION "reject_agreement_immutable_record_update"();
      CREATE TRIGGER "TR_agreement_finance_confirmations_immutable" BEFORE UPDATE OR DELETE ON "agreement_finance_confirmations" FOR EACH ROW EXECUTE FUNCTION "reject_agreement_immutable_record_update"();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE "agreement_finance_confirmations";
      DROP TABLE "agreement_party_acceptances";
      DROP TABLE "agreement_versions";
      DROP TABLE "agreements";
      DROP FUNCTION "reject_agreement_immutable_record_update"();
    `);
  }
}
