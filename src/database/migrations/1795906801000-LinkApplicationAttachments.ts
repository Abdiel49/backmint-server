import type { MigrationInterface, QueryRunner } from 'typeorm';

export class LinkApplicationAttachments1795906801000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "application_attachments" ADD "applicationId" uuid REFERENCES "applications"("id") ON DELETE RESTRICT');
    await queryRunner.query('CREATE INDEX "IDX_application_attachments_application" ON "application_attachments" ("applicationId")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_application_attachments_application"');
    await queryRunner.query('ALTER TABLE "application_attachments" DROP COLUMN "applicationId"');
  }
}
