import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApplicationAnswerScanPassed1795906804000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "application_answers" DROP CONSTRAINT "application_answers_fileScanStatus_check"');
    await queryRunner.query(`ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_fileScanStatus_check" CHECK ("fileScanStatus" IN ('NotRequired', 'Pending', 'Passed'))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "application_answers" DROP CONSTRAINT "application_answers_fileScanStatus_check"');
    await queryRunner.query(`ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_fileScanStatus_check" CHECK ("fileScanStatus" IN ('NotRequired', 'Pending'))`);
  }
}
