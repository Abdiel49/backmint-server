import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1794528000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SELECT 1');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SELECT 1');
  }
}
