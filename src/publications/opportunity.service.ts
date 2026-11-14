import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type {
  FundingDirection,
  PublicationSourceType,
} from './publication.types.js';

export type OpportunityFilters = {
  sourceType?: PublicationSourceType;
  direction?: FundingDirection;
  limit: number;
  offset: number;
};

@Injectable()
export class OpportunityService {
  constructor(private readonly dataSource: DataSource) {}

  async browse(filters: OpportunityFilters): Promise<{
    items: Record<string, unknown>[];
    limit: number;
    offset: number;
  }> {
    const sql = `
      SELECT * FROM (
        SELECT 'Project'::text AS "sourceType", p."id" AS "sourceId", p."title", p."description", p."direction", p."visibility", p."lifecycleStatus", p."intakeStatus", p."publishedAt", p."fundingTargetAmount", p."targetAsset", p."content"->'audienceTypes' AS "audienceTypes", p."content"->'supportTypes' AS "supportTypes", p."intakeClosesAt"
        FROM "projects" p
        WHERE $3::boolean AND p."visibility" = 'Public' AND p."lifecycleStatus" IN ('Published', 'Active') AND ($5::varchar IS NULL OR p."direction" = $5)
        UNION ALL
        SELECT 'Call'::text AS "sourceType", c."id" AS "sourceId", c."title", c."description", c."direction", c."visibility", c."lifecycleStatus", c."intakeStatus", c."publishedAt", c."fundingTargetAmount", c."targetAsset", c."content"->'audienceTypes' AS "audienceTypes", c."content"->'supportTypes' AS "supportTypes", c."intakeClosesAt"
        FROM "calls" c
        WHERE $4::boolean AND c."visibility" = 'Public' AND c."lifecycleStatus" IN ('Published', 'Active') AND ($5::varchar IS NULL OR c."direction" = $5)
      ) opportunities
      ORDER BY "publishedAt" DESC NULLS LAST, "sourceType" ASC, "sourceId" ASC
      LIMIT $1 OFFSET $2
    `;
    const params = [
      filters.limit,
      filters.offset,
      filters.sourceType !== 'Call',
      filters.sourceType !== 'Project',
      filters.direction ?? null,
    ];
    const items = (await this.dataSource.query(sql, params)) as Record<
      string,
      unknown
    >[];
    return { items, limit: filters.limit, offset: filters.offset };
  }
}
