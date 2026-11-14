import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWalletLinkNetwork1795647600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "UQ_wallet_links_active_account"');
    await queryRunner.query(
      'ALTER TABLE "wallet_links" ADD "network" varchar(16) NOT NULL DEFAULT \'testnet\'',
    );
    await queryRunner.query(
      'ALTER TABLE "wallet_links" ADD CONSTRAINT "CHK_wallet_links_network" CHECK ("network" IN (\'testnet\', \'mainnet\'))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_wallet_links_active_account" ON "wallet_links" ("network", "accountId") WHERE "revokedAt" IS NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "UQ_wallet_links_active_account"');
    await queryRunner.query(
      'ALTER TABLE "wallet_links" DROP CONSTRAINT "CHK_wallet_links_network"',
    );
    await queryRunner.query('ALTER TABLE "wallet_links" DROP COLUMN "network"');
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_wallet_links_active_account" ON "wallet_links" ("accountId") WHERE "revokedAt" IS NULL',
    );
  }
}
