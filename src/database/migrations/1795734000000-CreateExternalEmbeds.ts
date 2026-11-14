import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExternalEmbeds1795734000000 implements MigrationInterface {
  name = 'CreateExternalEmbeds1795734000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "external_embeds" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "stateVersion" integer NOT NULL DEFAULT 1,
        "hostOrganizationId" uuid NOT NULL,
        "sourceType" varchar(16) NOT NULL,
        "sourceId" uuid NOT NULL,
        "allowedOrigins" text[] NOT NULL,
        "theme" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "mode" varchar(16) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'Disabled',
        "scriptVersion" varchar(32) NOT NULL DEFAULT 'v1',
        CONSTRAINT "PK_external_embeds" PRIMARY KEY ("id"),
        CONSTRAINT "FK_external_embeds_host_organization" FOREIGN KEY ("hostOrganizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "CK_external_embeds_source_type" CHECK ("sourceType" IN ('Project', 'Call')),
        CONSTRAINT "CK_external_embeds_mode" CHECK ("mode" IN ('Card', 'List', 'Link')),
        CONSTRAINT "CK_external_embeds_status" CHECK ("status" IN ('Active', 'Disabled')),
        CONSTRAINT "CK_external_embeds_origins" CHECK (cardinality("allowedOrigins") > 0)
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_external_embeds_host_organization" ON "external_embeds" ("hostOrganizationId")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "external_embeds"');
  }
}
