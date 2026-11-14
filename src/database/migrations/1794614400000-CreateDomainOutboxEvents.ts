import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDomainOutboxEvents1794614400000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "domain_outbox_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "event_name" varchar(160) NOT NULL,
        "payload" jsonb NOT NULL,
        "aggregate_id" varchar(128) NOT NULL,
        "correlation_id" varchar(128) NOT NULL,
        "causation_id" varchar(128),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "published_at" timestamptz,
        "locked_until" timestamptz,
        "attempts" integer NOT NULL DEFAULT 0,
        "last_error" text
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_domain_outbox_events_pending"
      ON "domain_outbox_events" ("created_at")
      WHERE "published_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "domain_outbox_events"');
  }
}
