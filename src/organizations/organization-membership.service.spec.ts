import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { OrganizationRole } from '../domain/authorization/authorization.js';
import { OrganizationEntity } from './organization.entity.js';
import { OrganizationMembershipEntity } from './organization-membership.entity.js';
import { OrganizationRepresentativeEntity } from './organization-representative.entity.js';
import { OrganizationMembershipService } from './organization-membership.service.js';
import { UserEntity } from '../identity/user.entity.js';

function createHarness() {
  const organization = { id: 'org-1', ownerUserId: 'owner-1' };
  const membership = {
    id: 'membership-1',
    organizationId: 'org-1',
    userId: 'user-2',
    role: OrganizationRole.Representative,
    status: 'Active',
    acceptedAt: new Date(),
  };
  const representativeRepository = {
    create: vi.fn((value) => value),
    save: vi.fn(async (value) => ({ id: 'authority-1', ...value })),
    createQueryBuilder: vi.fn(() => {
      const query = {
        innerJoin: vi.fn(() => query),
        where: vi.fn(() => query),
        andWhere: vi.fn(() => query),
        orderBy: vi.fn(() => query),
        getOne: vi.fn(async () => null),
      };
      return query;
    }),
  };
  const membershipRepository = {
    create: vi.fn((value) => value),
    save: vi.fn(async (value) => ({ id: 'membership-1', ...value })),
    findOne: vi.fn(async () => membership),
  };
  const manager = {
    findOne: vi.fn(async (entity) => {
      if (entity === OrganizationEntity) return organization;
      if (entity === OrganizationMembershipEntity) return membership;
      if (entity === OrganizationRepresentativeEntity) return null;
      if (entity === UserEntity) return { id: 'user-2', status: 'Active' };
      return null;
    }),
    getRepository: vi.fn((entity) =>
      entity === OrganizationRepresentativeEntity
        ? representativeRepository
        : membershipRepository,
    ),
    save: vi.fn(async (value) => value),
    update: vi.fn(async () => undefined),
  };
  const dataSource = {
    transaction: vi.fn(async (callback) => callback(manager)),
    getRepository: vi.fn((entity) =>
      entity === OrganizationRepresentativeEntity
        ? representativeRepository
        : membershipRepository,
    ),
  };
  return {
    service: new OrganizationMembershipService(dataSource as never),
    manager,
    dataSource,
    membershipRepository,
    representativeRepository,
  };
}

describe('OrganizationMembershipService', () => {
  it('creates role-scoped invitations after owner authorization', async () => {
    const { service, membershipRepository } = createHarness();

    await expect(
      service.inviteMember('owner-1', 'org-1', {
        userId: 'user-2',
        role: OrganizationRole.Evaluator,
      }),
    ).resolves.toMatchObject({
      organizationId: 'org-1',
      userId: 'user-2',
      role: OrganizationRole.Evaluator,
      status: 'Invited',
    });
    expect(membershipRepository.save).toHaveBeenCalledOnce();
  });

  it('does not permit assigning the owner role by invitation', async () => {
    const { service } = createHarness();

    await expect(
      service.inviteMember('owner-1', 'org-1', {
        userId: 'user-2',
        role: OrganizationRole.Owner as never,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts an invitation only for the authenticated invitee', async () => {
    const { service, manager } = createHarness();
    manager.findOne.mockImplementation(async (entity, options) => {
      if (entity !== OrganizationMembershipEntity) return null;
      return options.where.userId === 'user-2'
        ? { id: 'membership-1', status: 'Invited', acceptedAt: null }
        : null;
    });

    await expect(
      service.acceptInvitation('attacker-1', 'membership-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.acceptInvitation('user-2', 'membership-1'),
    ).resolves.toMatchObject({ status: 'Active' });
  });

  it('rejects duplicate active and pending pairs through the database constraint', async () => {
    const { service, membershipRepository } = createHarness();
    const duplicateError = new QueryFailedError(
      'INSERT',
      [],
      Object.assign(new Error('duplicate'), { code: '23505' }),
    );
    membershipRepository.save.mockRejectedValue(duplicateError);

    await expect(
      service.inviteMember('owner-1', 'org-1', {
        userId: 'user-2',
        role: OrganizationRole.Observer,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires a separate future-dated representative verification record', async () => {
    const { service, representativeRepository } = createHarness();

    await expect(
      service.verifyRepresentative(
        'owner-1',
        'org-1',
        'user-2',
        new Date(Date.now() + 60_000),
        'registry-record-2026-0042',
      ),
    ).resolves.toMatchObject({
      verifiedByUserId: 'owner-1',
      verificationReference: 'registry-record-2026-0042',
      revokedAt: null,
    });
    expect(representativeRepository.save).toHaveBeenCalledOnce();
  });

  it('rejects legal-term acceptance when separate authority is expired or missing', async () => {
    const { service, dataSource, representativeRepository } = createHarness();
    representativeRepository.createQueryBuilder.mockImplementation(() => {
      const query = {
        innerJoin: vi.fn(() => query),
        where: vi.fn(() => query),
        andWhere: vi.fn(() => query),
        orderBy: vi.fn(() => query),
        getOne: vi.fn(async () => ({
          organizationId: 'org-1',
          userId: 'user-2',
          verifiedAt: new Date(Date.now() - 120_000),
          expiresAt: new Date(Date.now() - 60_000),
          revokedAt: null,
        })),
      };
      return query as never;
    });
    const membershipRepo = dataSource.getRepository(
      OrganizationMembershipEntity,
    ) as unknown as { findOne: ReturnType<typeof vi.fn> };
    membershipRepo.findOne.mockResolvedValue({
      organizationId: 'org-1',
      userId: 'user-2',
      role: OrganizationRole.Admin,
      status: 'Active',
    });

    await expect(service.canAcceptLegalTerms('user-2', 'org-1')).resolves.toBe(
      false,
    );
  });

  it('denies membership management to non-admin members', async () => {
    const { service, manager } = createHarness();
    manager.findOne.mockImplementation(async (entity) => {
      if (entity === OrganizationEntity) {
        return { id: 'org-1', ownerUserId: 'owner-1' };
      }
      if (entity === UserEntity) return { id: 'user-2', status: 'Active' };
      return {
        id: 'membership-1',
        organizationId: 'org-1',
        userId: 'project-manager-1',
        role: OrganizationRole.ProjectManager,
        status: 'Active',
      };
    });

    await expect(
      service.inviteMember('project-manager-1', 'org-1', {
        userId: 'user-2',
        role: OrganizationRole.Observer,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('revokes representative authority when the membership is suspended', async () => {
    const { service, manager } = createHarness();
    const member = {
      id: 'membership-1',
      organizationId: 'org-1',
      userId: 'user-2',
      role: OrganizationRole.Representative,
      status: 'Active',
    };
    manager.findOne.mockImplementation(async (entity) => {
      if (entity === OrganizationEntity) {
        return { id: 'org-1', ownerUserId: 'owner-1' };
      }
      if (entity === OrganizationMembershipEntity) return member;
      return null;
    });

    await expect(
      service.suspendMembership('owner-1', 'membership-1'),
    ).resolves.toMatchObject({ status: 'Suspended' });
    expect(manager.update).toHaveBeenCalledWith(
      OrganizationRepresentativeEntity,
      expect.objectContaining({ organizationId: 'org-1', userId: 'user-2' }),
      expect.objectContaining({
        revokedByUserId: 'owner-1',
        revocationReason: 'Organization membership suspended',
      }),
    );
  });

  it('revokes representative authority when its role is removed', async () => {
    const { service, manager } = createHarness();
    const member = {
      id: 'membership-1',
      organizationId: 'org-1',
      userId: 'user-2',
      role: OrganizationRole.Representative,
      status: 'Active',
    };
    manager.findOne.mockImplementation(async (entity) => {
      if (entity === OrganizationEntity) {
        return { id: 'org-1', ownerUserId: 'owner-1' };
      }
      if (entity === OrganizationMembershipEntity) return member;
      return null;
    });

    await service.changeRole(
      'owner-1',
      'membership-1',
      OrganizationRole.Observer,
    );

    expect(manager.update).toHaveBeenCalledWith(
      OrganizationRepresentativeEntity,
      expect.objectContaining({ organizationId: 'org-1', userId: 'user-2' }),
      expect.objectContaining({
        revokedByUserId: 'owner-1',
        revocationReason: 'Organization representative role removed',
      }),
    );
  });

  it('records representative authority revocation independently from membership status', async () => {
    const { service, manager } = createHarness();
    manager.findOne.mockImplementation(async (entity) => {
      if (entity === OrganizationRepresentativeEntity) {
        return {
          id: 'authority-1',
          organizationId: 'org-1',
          userId: 'user-2',
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
        };
      }
      if (entity === OrganizationEntity) {
        return { id: 'org-1', ownerUserId: 'owner-1' };
      }
      return null;
    });

    await expect(
      service.revokeRepresentative(
        'owner-1',
        'authority-1',
        'Registry record withdrawn',
      ),
    ).resolves.toMatchObject({
      id: 'authority-1',
      revokedByUserId: 'owner-1',
      revocationReason: 'Registry record withdrawn',
    });
  });
});
