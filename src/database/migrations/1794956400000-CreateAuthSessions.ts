import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthSessions1794956400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "auth_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "tokenHash" varchar(64) NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "revokedAt" timestamptz,
        "lastUsedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_auth_sessions_token_hash" ON "auth_sessions" ("tokenHash")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_auth_sessions_user_active" ON "auth_sessions" ("userId", "expiresAt") WHERE "revokedAt" IS NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "auth_sessions"');
  }
}
