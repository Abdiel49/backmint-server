import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChainOperationObservations1795647601000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "chain_operations" ADD COLUMN "signerAccountId" varchar(64)',
    );
    await queryRunner.query(`
      CREATE FUNCTION guard_chain_operation_signer() RETURNS trigger AS $$
      BEGIN
        IF OLD."signerAccountId" IS NOT NULL
          AND NEW."signerAccountId" IS DISTINCT FROM OLD."signerAccountId" THEN
          RAISE EXCEPTION 'Chain operation signer is immutable once recorded';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TR_chain_operation_signer_immutable"
      BEFORE UPDATE ON "chain_operations"
      FOR EACH ROW EXECUTE FUNCTION guard_chain_operation_signer()
    `);
    await queryRunner.query(`
      CREATE TABLE "chain_operation_observations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "chainOperationId" uuid NOT NULL REFERENCES "chain_operations"("id") ON DELETE RESTRICT,
        "network" varchar(32) NOT NULL,
        "transactionHash" varchar(128) NOT NULL,
        "signerAccountId" varchar(64) NOT NULL,
        "result" varchar(16) NOT NULL CHECK ("result" IN ('Succeeded', 'Failed')),
        "blockHash" varchar(128) NOT NULL,
        "executionStatus" jsonb NOT NULL,
        "observedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_chain_operation_observations_operation_tx" UNIQUE ("chainOperationId", "transactionHash")
      )
    `);
    await queryRunner.query(`
      CREATE FUNCTION reject_chain_operation_observation_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'Chain operation observations are immutable';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TR_chain_operation_observations_immutable"
      BEFORE UPDATE OR DELETE ON "chain_operation_observations"
      FOR EACH ROW EXECUTE FUNCTION reject_chain_operation_observation_mutation()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TRIGGER "TR_chain_operation_observations_immutable" ON "chain_operation_observations"',
    );
    await queryRunner.query(
      'DROP FUNCTION reject_chain_operation_observation_mutation()',
    );
    await queryRunner.query('DROP TABLE "chain_operation_observations"');
    await queryRunner.query(
      'DROP TRIGGER "TR_chain_operation_signer_immutable" ON "chain_operations"',
    );
    await queryRunner.query('DROP FUNCTION guard_chain_operation_signer()');
    await queryRunner.query(
      'ALTER TABLE "chain_operations" DROP COLUMN "signerAccountId"',
    );
  }
}
