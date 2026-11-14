import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrganizationVerificationDisclosure1795820400000 implements MigrationInterface {
  name = 'AddOrganizationVerificationDisclosure1795820400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "organizations" ADD "discloseVerificationStatus" boolean NOT NULL DEFAULT false',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "organizations" DROP COLUMN "discloseVerificationStatus"',
    );
  }
}
