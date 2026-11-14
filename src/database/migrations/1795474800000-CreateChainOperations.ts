import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChainOperations1795474800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "chain_operations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "idempotencyKey" varchar(255) NOT NULL,
        "operationType" varchar(64) NOT NULL,
        "stateVersion" integer NOT NULL DEFAULT 1 CHECK ("stateVersion" > 0),
        "payloadHash" varchar(64) NOT NULL CHECK ("payloadHash" ~ '^[a-f0-9]{64}$'),
        "requestedBy" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "correlationId" varchar(128) NOT NULL,
        "status" varchar(16) NOT NULL CHECK ("status" IN ('IntentReady', 'Submitted', 'Confirmed', 'Failed', 'Unknown')),
        "intent" jsonb NOT NULL,
        "transactionHash" varchar(128),
        "errorCode" varchar(128),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_chain_operations_requester_key" UNIQUE ("requestedBy", "idempotencyKey"),
        CONSTRAINT "CK_chain_operations_transaction_status" CHECK ("status" NOT IN ('Submitted', 'Confirmed') OR "transactionHash" IS NOT NULL)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_chain_operations_status_updated" ON "chain_operations" ("status", "updatedAt")',
    );
    await queryRunner.query(`
      CREATE FUNCTION guard_chain_operation_update() RETURNS trigger AS $$
      BEGIN
        IF NEW."id" <> OLD."id"
          OR NEW."idempotencyKey" <> OLD."idempotencyKey"
          OR NEW."operationType" <> OLD."operationType"
          OR NEW."payloadHash" <> OLD."payloadHash"
          OR NEW."requestedBy" <> OLD."requestedBy"
          OR NEW."correlationId" <> OLD."correlationId"
          OR NEW."intent" <> OLD."intent"
          OR NEW."stateVersion" <> OLD."stateVersion" + 1
          OR (OLD."transactionHash" IS NOT NULL AND NEW."transactionHash" IS DISTINCT FROM OLD."transactionHash")
          OR NOT (
            (OLD."status" = 'IntentReady' AND NEW."status" IN ('Submitted', 'Failed', 'Unknown'))
            OR (OLD."status" = 'Submitted' AND NEW."status" IN ('Confirmed', 'Failed', 'Unknown'))
            OR (OLD."status" = 'Unknown' AND NEW."status" IN ('Confirmed', 'Failed'))
          ) THEN
          RAISE EXCEPTION 'Chain operation update is not an allowed state transition';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TR_chain_operations_guard_update"
      BEFORE UPDATE ON "chain_operations"
      FOR EACH ROW EXECUTE FUNCTION guard_chain_operation_update()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TRIGGER "TR_chain_operations_guard_update" ON "chain_operations"',
    );
    await queryRunner.query('DROP FUNCTION guard_chain_operation_update()');
    await queryRunner.query('DROP INDEX "IDX_chain_operations_status_updated"');
    await queryRunner.query('DROP TABLE "chain_operations"');
  }
}
