import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApplicationAttachmentScanStates1795906803000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "application_attachments" DROP CONSTRAINT "application_attachments_status_check"');
    await queryRunner.query(`ALTER TABLE "application_attachments" ADD CONSTRAINT "application_attachments_status_check" CHECK ("status" IN ('PendingUpload', 'Uploaded', 'Clean', 'Quarantined'))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "application_attachments" DROP CONSTRAINT "application_attachments_status_check"');
    await queryRunner.query(`ALTER TABLE "application_attachments" ADD CONSTRAINT "application_attachments_status_check" CHECK ("status" IN ('PendingUpload', 'Uploaded'))`);
  }
}
