import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotifications1795129200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notification_preferences" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "category" varchar(100) NOT NULL,
        "inboxEnabled" boolean NOT NULL DEFAULT true,
        "emailEnabled" boolean NOT NULL DEFAULT false,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CK_notification_preferences_category" CHECK ("category" ~ '^[a-z][a-z0-9_.-]{0,99}$'),
        CONSTRAINT "UQ_notification_preferences_user_category" UNIQUE ("userId", "category")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "idempotencyKey" varchar(160) NOT NULL,
        "category" varchar(100) NOT NULL,
        "title" varchar(240) NOT NULL,
        "body" text NOT NULL,
        "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "inboxEnabled" boolean NOT NULL DEFAULT true,
        "emailEnabled" boolean NOT NULL DEFAULT false,
        "emailStatus" varchar(24) NOT NULL DEFAULT 'NotRequested',
        "processingStatus" varchar(24) NOT NULL DEFAULT 'Pending',
        "attempts" integer NOT NULL DEFAULT 0,
        "lastFailure" text,
        "readAt" timestamptz,
        "processedAt" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CK_notifications_category" CHECK ("category" ~ '^[a-z][a-z0-9_.-]{0,99}$'),
        CONSTRAINT "CK_notifications_email_status" CHECK ("emailStatus" IN ('NotRequested', 'NotConfigured')),
        CONSTRAINT "CK_notifications_processing_status" CHECK ("processingStatus" IN ('Pending', 'Processed', 'Retrying', 'Failed')),
        CONSTRAINT "UQ_notifications_user_idempotency_key" UNIQUE ("userId", "idempotencyKey")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_notifications_user_created_at"
      ON "notifications" ("userId", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_notifications_delivery_status"
      ON "notifications" ("processingStatus", "updated_at")
      WHERE "processingStatus" IN ('Pending', 'Retrying', 'Failed')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "notifications"');
    await queryRunner.query('DROP TABLE "notification_preferences"');
  }
}
