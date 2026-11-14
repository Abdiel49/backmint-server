import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { CallEntity } from './call.entity.js';
import { OrganizationMembershipEntity } from '../organizations/organization-membership.entity.js';
import {
  EligibilityRuleEntity,
  OpportunityPolicyEntity,
  QuestionnaireEntity,
} from './publication-auxiliary.entity.js';
import { EligibilityAdminService } from './eligibility-admin.service.js';

describe('EligibilityAdminService authorization and version guards', () => {
  const config = {
    eligibilityRule: { audienceTypes: ['Community'] },
    questionnaire: { questions: [] },
    opportunityPolicy: {},
  } as const;

  function setup(
    lifecycleStatus: string,
    ownerUserId?: string,
    membership?: object,
  ) {
    const source = {
      id: 'source-1',
      ownerUserId: ownerUserId ?? 'owner-user',
      ownerOrganizationId: 'org-1',
      lifecycleStatus,
      content: {
        title: 'Call',
        description: 'Call description',
        direction: 'FundingOffered',
        visibility: 'Private',
        lifecycleStatus,
        intakeStatus: 'Open',
        hardCapEnabled: false,
        ownerUserId: ownerUserId ?? 'owner-user',
        ownerOrganizationId: 'org-1',
        audienceTypes: ['Community'],
        supportTypes: ['Grant'],
      },
    };
    const repository = {
      findOne: vi.fn().mockResolvedValue(source),
      save: vi.fn(),
      create: vi.fn((value) => value),
      find: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
    };
    const manager = {
      getRepository: vi.fn((entity) =>
        entity === CallEntity
          ? repository
          : entity === OrganizationMembershipEntity
            ? {
                findOne: vi
                  .fn()
                  .mockImplementation(({ where }) =>
                    membership?.status === where.status ? membership : null,
                  ),
              }
            : entity === EligibilityRuleEntity || entity === QuestionnaireEntity
              ? {
                  findOne: vi.fn().mockResolvedValue(null),
                  create: vi.fn((value) => value),
                  save: vi.fn((value) =>
                    Array.isArray(value)
                      ? value
                      : { id: 'questionnaire-1', ...value },
                  ),
                }
              : entity === OpportunityPolicyEntity
                ? { upsert: vi.fn() }
                : { save: vi.fn((value) => value) },
      ),
      create: vi.fn((_entity, value) => value),
    };
    const service = new EligibilityAdminService({
      transaction: (callback) => callback(manager),
    } as never);
    return { service, repository };
  }

  it('allows an individual source owner', async () => {
    const { service } = setup('Draft', 'user-1');
    await expect(
      service.configure('Call', 'source-1', 'user-1', config),
    ).resolves.toMatchObject({ sourceType: 'Call' });
  });

  it('requires an active owner, admin, or project manager membership', async () => {
    const { service } = setup('Draft');
    await expect(
      service.configure('Call', 'source-1', 'user-2', config),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const { service: evaluatorService } = setup('Draft', undefined, {
      role: 'Evaluator',
      status: 'Active',
    });
    await expect(
      evaluatorService.configure('Call', 'source-1', 'user-2', config),
    ).rejects.toBeInstanceOf(ForbiddenException);
    for (const role of ['Owner', 'Admin', 'ProjectManager']) {
      const { service: permittedService } = setup('Draft', undefined, {
        role,
        status: 'Active',
      });
      await expect(
        permittedService.configure('Call', 'source-1', 'user-2', config),
      ).resolves.toMatchObject({ sourceType: 'Call' });
    }
    const { service: inactiveService } = setup('Draft', undefined, {
      role: 'Admin',
      status: 'Revoked',
    });
    await expect(
      inactiveService.configure('Call', 'source-1', 'user-2', config),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects changes after publication', async () => {
    const { service } = setup('Published', 'user-1');
    await expect(
      service.configure('Call', 'source-1', 'user-1', config),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
