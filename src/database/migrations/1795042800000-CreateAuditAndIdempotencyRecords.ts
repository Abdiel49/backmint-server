import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditAndIdempotencyRecords1795042800000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "audit_events" (
        "id" uuid PRIMARY KEY,
        "action" varchar(128) NOT NULL,
        "outcome" varchar(16) NOT NULL CHECK ("outcome" IN ('Allowed', 'Denied', 'Failed')),
        "target_type" varchar(64) NOT NULL,
        "target_id" varchar(128) NOT NULL,
        "actor_user_id" uuid NOT NULL,
        "acting_organization_id" uuid,
        "membership_role" varchar(32),
        "correlation_id" varchar(128) NOT NULL,
        "occurred_at" timestamptz NOT NULL,
        "before_hash" varchar(64),
        "after_hash" varchar(64),
        "reason_code" varchar(128),
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_audit_events_target" ON "audit_events" ("target_type", "target_id", "occurred_at")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_audit_events_actor" ON "audit_events" ("actor_user_id", "occurred_at")',
    );
    await queryRunner.query(`
      CREATE FUNCTION reject_audit_event_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'Audit events are immutable';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TR_audit_events_immutable"
      BEFORE UPDATE OR DELETE ON "audit_events"
      FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation()
    `);
    await queryRunner.query(`
      CREATE TABLE "idempotency_records" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "scope" varchar(160) NOT NULL,
        "key" varchar(255) NOT NULL,
        "request_hash" varchar(64) NOT NULL,
        "state" varchar(16) NOT NULL CHECK ("state" IN ('InProgress', 'Completed')),
        "response" jsonb,
        "expires_at" timestamptz NOT NULL,
        "completed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_idempotency_records_scope_key" UNIQUE ("scope", "key")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_idempotency_records_expiration" ON "idempotency_records" ("expires_at")',
    );
    await queryRunner.query(`
      CREATE TABLE "external_integration_records" (
        "id" uuid PRIMARY KEY,
        "provider" varchar(96) NOT NULL,
        "operation" varchar(128) NOT NULL,
        "idempotencyKey" varchar(255) NOT NULL,
        "correlationId" varchar(128) NOT NULL,
        "causationId" varchar(128),
        "requestHash" varchar(64) NOT NULL,
        "state" varchar(16) NOT NULL CHECK ("state" IN ('Pending', 'Submitted', 'Confirmed', 'Failed', 'Unknown')),
        "externalReference" varchar(255),
        "errorCode" varchar(128),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_external_integrations_provider_operation_key"
          UNIQUE ("provider", "operation", "idempotencyKey")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "external_integration_records"');
    await queryRunner.query('DROP TABLE "idempotency_records"');
    await queryRunner.query('DROP TRIGGER "TR_audit_events_immutable" ON "audit_events"');
    await queryRunner.query('DROP FUNCTION reject_audit_event_mutation()');
    await queryRunner.query('DROP TABLE "audit_events"');
  }
}
