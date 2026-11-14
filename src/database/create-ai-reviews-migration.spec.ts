import { describe, expect, it, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { CreateAIReviews1795561200000 } from './migrations/1795561200000-CreateAIReviews.js';

describe('CreateAIReviews1795561200000', () => {
  it('creates consent and immutable advisory outputs with retention and action-free schema constraints', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: vi.fn(async (query: string) => queries.push(query)),
    } as unknown as QueryRunner;

    await new CreateAIReviews1795561200000().up(queryRunner);

    expect(queries.join('\n')).toContain('CREATE TABLE "ai_review_consents"');
    expect(queries.join('\n')).toContain('CREATE TABLE "ai_reviews"');
    expect(queries.join('\n')).toContain('"retentionDays" BETWEEN 1 AND 365');
    expect(queries.join('\n')).toContain(
      'jsonb_array_length("citedSources") > 0',
    );
    expect(queries.join('\n')).toContain(
      "\"advisoryOutput\" - 'summary' - 'observations' = '{}'::jsonb",
    );
    expect(queries.join('\n')).toContain('TR_ai_reviews_immutable');
    expect(queries.join('\n')).toContain('TR_ai_review_consents_immutable');
    expect(queries.join('\n')).not.toMatch(
      /CREATE TABLE "(evaluations|awards|agreements|payments|chain_operations)"/,
    );
  });

  it('reverts triggers and tables in dependency order', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: vi.fn(async (query: string) => queries.push(query)),
    } as unknown as QueryRunner;

    await new CreateAIReviews1795561200000().down(queryRunner);

    expect(queries).toEqual([
      'DROP TRIGGER "TR_ai_review_consents_immutable" ON "ai_review_consents"',
      'DROP FUNCTION "reject_ai_review_consent_mutation"()',
      'DROP TRIGGER "TR_ai_reviews_immutable" ON "ai_reviews"',
      'DROP FUNCTION "reject_ai_review_update"()',
      'DROP TABLE "ai_reviews"',
      'DROP TABLE "ai_review_consents"',
    ]);
  });
});
