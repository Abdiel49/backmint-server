import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVerificationDocumentScanStates1795734001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "verification_documents"
        ADD COLUMN "scanStatus" varchar(20) NOT NULL DEFAULT 'PendingUpload',
        ADD COLUMN "scanAttempts" integer NOT NULL DEFAULT 0,
        ADD COLUMN "scanFailure" text,
        ADD COLUMN "uploadedAt" timestamptz,
        ADD COLUMN "scannedAt" timestamptz,
        ADD CONSTRAINT "CK_verification_documents_scan_status"
          CHECK ("scanStatus" IN ('PendingUpload', 'Queued', 'Scanning', 'Passed', 'Infected', 'Quarantined')),
        ADD CONSTRAINT "CK_verification_documents_scan_attempts"
          CHECK ("scanAttempts" >= 0)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_verification_documents_scan_status"
      ON "verification_documents" ("scanStatus", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX "IDX_verification_documents_scan_status"',
    );
    await queryRunner.query(`
      ALTER TABLE "verification_documents"
        DROP CONSTRAINT "CK_verification_documents_scan_attempts",
        DROP CONSTRAINT "CK_verification_documents_scan_status",
        DROP COLUMN "scannedAt",
        DROP COLUMN "uploadedAt",
        DROP COLUMN "scanFailure",
        DROP COLUMN "scanAttempts",
        DROP COLUMN "scanStatus"
    `);
  }
}
