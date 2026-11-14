import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ExternalEmbedsService } from './external-embeds.service.js';

const organizationId = '8bc0ea27-9086-4980-8b1a-69a0e7bdc885';
const sourceId = '0b266ebc-241c-433f-b16c-2732e22a7f3d';
const embedId = '91bdbf92-19c5-4b59-bcdd-a67aeb6a44dc';
const origin = 'https://foundation.example';

function serviceWith(source: Record<string, unknown> | null, embed = {
  id: embedId,
  hostOrganizationId: organizationId,
  sourceType: 'Call',
  sourceId,
  allowedOrigins: [origin],
  theme: { accentColor: '#164e63' },
  mode: 'Card',
  status: 'Active',
  scriptVersion: 'v1',
}) {
  const embeds = { findOne: vi.fn().mockResolvedValue(embed) };
  const projects = { findOne: vi.fn() };
  const calls = { findOne: vi.fn().mockResolvedValue(source) };
  return {
    service: new ExternalEmbedsService(embeds as never, {} as never, {} as never, projects as never, calls as never),
    embeds,
    calls,
  };
}

describe('ExternalEmbedsService public projection', () => {
  it('returns a strict published projection and omits undisclosed and private fields', async () => {
    const source = {
      id: sourceId,
      title: 'Community Solar Grants',
      description: 'Funding for community solar.',
      direction: 'FundingOffered',
      visibility: 'Public',
      lifecycleStatus: 'Published',
      intakeStatus: 'Open',
      publishedAt: new Date('2026-11-14T12:00:00.000Z'),
      fundingTargetAmount: '2500000',
      targetAsset: 'NEAR',
      intakeClosesAt: null,
      content: {
        audienceTypes: ['Nonprofit'],
        supportTypes: ['Grant'],
        opportunityPolicy: { disclosurePolicy: { fundingTargetAmount: true, audienceTypes: true } },
      },
      privateNotes: 'must not leak',
      applications: [{ applicantId: 'secret' }],
      evaluations: [{ score: 1 }],
      claims: [{ evidence: 'private' }],
    };
    const { service } = serviceWith(source);
    const result = await service.readPublic(embedId, origin);
    expect(result.source).toMatchObject({ fundingTargetAmount: '2500000', audienceTypes: ['Nonprofit'], supportTypes: [] });
    expect(JSON.stringify(result)).not.toMatch(/privateNotes|applications|evaluations|claims|must not leak/);
  });

  it('rejects a non-allowlisted origin and a missing origin', async () => {
    const { service } = serviceWith({ id: sourceId, visibility: 'Public', lifecycleStatus: 'Published' });
    await expect(service.readPublic(embedId, 'https://attacker.example')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.readPublic(embedId, undefined)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('hides private and unpublished sources', async () => {
    const { service } = serviceWith({ id: sourceId, visibility: 'Private', lifecycleStatus: 'Published' });
    await expect(service.readPublic(embedId, origin)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('requires the embed to be active', async () => {
    const { service } = serviceWith(null, { id: embedId, status: 'Disabled' });
    await expect(service.readPublic(embedId, origin)).rejects.toBeInstanceOf(NotFoundException);
  });
});
