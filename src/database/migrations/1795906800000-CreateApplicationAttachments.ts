import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateApplicationAttachments1795906800000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "application_attachments" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "uploadedByUserId" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
      "organizationId" uuid REFERENCES "organizations"("id") ON DELETE RESTRICT,
      "storageKey" varchar(1024) NOT NULL UNIQUE,
      "mimeType" varchar(255) NOT NULL,
      "sizeBytes" bigint NOT NULL CHECK ("sizeBytes" > 0),
      "checksumSha256" varchar(64) NOT NULL,
      "status" varchar(24) NOT NULL DEFAULT 'PendingUpload' CHECK ("status" = 'PendingUpload'),
      "createdAt" timestamptz NOT NULL DEFAULT now()
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "application_attachments"');
  }
}
