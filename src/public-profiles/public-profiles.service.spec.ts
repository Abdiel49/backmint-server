import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PublicProfilesService } from './public-profiles.service.js';

const organization = (overrides: Record<string, unknown> = {}) => ({
  id: 'a54e27b4-2c0a-4d66-a9ab-8c98fb6281e8',
  slug: 'green-futures-bolivia',
  name: 'Green Futures Bolivia',
  organizationType: 'Nonprofit',
  country: 'BO',
  legalStatus: 'Incorporated',
  visibility: 'Public',
  status: 'Active',
  discloseVerificationStatus: false,
  ...overrides,
});

const setup = () => {
  const organizations = {
    findAndCount: vi.fn(),
    findOne: vi.fn(),
    findOneBy: vi.fn(),
    save: vi.fn(),
  };
  const verifications = { findOneBy: vi.fn() };
  const projects = { findOneBy: vi.fn() };
  const calls = { findOneBy: vi.fn() };
  const memberships = { findOne: vi.fn() };
  return {
    service: new PublicProfilesService(
      organizations as never,
      verifications as never,
      projects as never,
      calls as never,
      memberships as never,
    ),
    organizations,
    verifications,
    projects,
    calls,
    memberships,
  };
};

describe('PublicProfilesService', () => {
  it('returns only allowlisted organization fields and hides verification by default', async () => {
    const { service, organizations, verifications } = setup();
    organizations.findOne.mockResolvedValue(
      organization({ ownerUserId: 'private-owner-id' }),
    );
    await expect(
      service.organization('green-futures-bolivia'),
    ).resolves.toEqual({
      id: 'a54e27b4-2c0a-4d66-a9ab-8c98fb6281e8',
      slug: 'green-futures-bolivia',
      name: 'Green Futures Bolivia',
      organizationType: 'Nonprofit',
      country: 'BO',
      legalStatus: 'Incorporated',
    });
    expect(verifications.findOneBy).not.toHaveBeenCalled();
  });

  it('reveals only a current verification result after explicit disclosure', async () => {
    const { service, organizations, verifications } = setup();
    organizations.findOne.mockResolvedValue(
      organization({ discloseVerificationStatus: true }),
    );
    verifications.findOneBy.mockResolvedValue({
      status: 'Verified',
      expiresAt: null,
      revokedAt: null,
      decisionReason: 'private',
    });
    const profile = await service.organization('green-futures-bolivia');
    expect(profile.verification).toEqual({ status: 'Verified' });
    expect(profile).not.toHaveProperty('decisionReason');
  });

  it('returns 404 for private organizations and directly resolves an unlisted organization by UUID', async () => {
    const { service, organizations } = setup();
    organizations.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(organization({ visibility: 'Unlisted' }));
    await expect(
      service.organization('private-org-slug'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.organization('a54e27b4-2c0a-4d66-a9ab-8c98fb6281e8'),
    ).resolves.toHaveProperty('slug', 'green-futures-bolivia');
    expect(organizations.findOne.mock.calls[1]?.[0]).toMatchObject({
      where: expect.arrayContaining([
        {
          id: 'a54e27b4-2c0a-4d66-a9ab-8c98fb6281e8',
          visibility: 'Unlisted',
          status: 'Active',
        },
      ]),
    });
  });

  it('omits every optional publication field unless individually disclosed', async () => {
    const { service, projects } = setup();
    projects.findOneBy.mockResolvedValue({
      id: 'f64f0d7f-d6f1-4c33-b27e-9aefb8b1f11c',
      title: 'Community Solar Grants',
      description: 'Published summary',
      direction: 'FundingOffered',
      lifecycleStatus: 'Published',
      intakeStatus: 'Open',
      visibility: 'Public',
      publishedAt: new Date('2026-11-14T12:00:00.000Z'),
      content: {
        fundingTargetAmount: '5000000',
        audienceTypes: ['Nonprofit'],
        eligibilityRule: { audienceTypes: ['Nonprofit'] },
        questionnaire: { questions: [{ label: 'Confidential question' }] },
        opportunityPolicy: { disclosurePolicy: { audienceTypes: true } },
      },
    });
    const profile = await service.opportunity(
      'Project',
      'f64f0d7f-d6f1-4c33-b27e-9aefb8b1f11c',
    );
    expect(profile).toHaveProperty('audienceTypes', ['Nonprofit']);
    expect(profile).not.toHaveProperty('fundingTargetAmount');
    expect(profile).not.toHaveProperty('eligibilityRule');
    expect(profile).not.toHaveProperty('questionnaire');
    expect(profile).not.toHaveProperty('content');
  });

  it('returns 404 for private and draft opportunities', async () => {
    const { service, calls } = setup();
    calls.findOneBy.mockResolvedValue({
      visibility: 'Private',
      lifecycleStatus: 'Draft',
      content: {},
    });
    await expect(
      service.opportunity('Call', 'f64f0d7f-d6f1-4c33-b27e-9aefb8b1f11c'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('requires an active Owner or Admin to change verification disclosure', async () => {
    const { service, memberships, organizations } = setup();
    memberships.findOne.mockResolvedValue({ role: 'Evaluator' });
    await expect(
      service.setVerificationDisclosure('user-1', 'org-1', true),
    ).rejects.toThrow('Organization owner or admin permission is required');
    memberships.findOne.mockResolvedValue({ role: 'Owner' });
    organizations.findOneBy.mockResolvedValue(organization());
    organizations.save.mockImplementation(async (row) => row);
    await expect(
      service.setVerificationDisclosure('user-1', 'org-1', true),
    ).resolves.toMatchObject({ discloseVerificationStatus: true });
  });
});
