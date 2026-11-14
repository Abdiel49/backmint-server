import { DataSource } from 'typeorm';
import { OpportunityService } from './opportunity.service.js';

describe('OpportunityService', () => {
  it('queries public published sources with deterministic pagination and no private participation fields', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const service = new OpportunityService({ query } as unknown as DataSource);
    const result = await service.browse({
      limit: 20,
      offset: 0,
      direction: 'FundingOffered',
    });

    expect(result).toEqual({ items: [], limit: 20, offset: 0 });
    expect(query).toHaveBeenCalledOnce();
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('p."visibility" = \'Public\'');
    expect(sql).toContain('c."visibility" = \'Public\'');
    expect(sql).toContain("p.\"lifecycleStatus\" IN ('Published', 'Active')");
    expect(sql).toContain(
      'ORDER BY "publishedAt" DESC NULLS LAST, "sourceType" ASC, "sourceId" ASC',
    );
    expect(sql).not.toContain('applications');
    expect(sql).not.toContain('evaluations');
    expect(sql).not.toContain('evidence');
    expect(params).toEqual([20, 0, true, true, 'FundingOffered']);
  });
});
