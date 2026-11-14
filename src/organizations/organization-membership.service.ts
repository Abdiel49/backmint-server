import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, IsNull, QueryFailedError } from 'typeorm';
import {
  authorize,
  OrganizationRole,
} from '../domain/authorization/authorization.js';
import { UserEntity } from '../identity/user.entity.js';
import { OrganizationEntity } from './organization.entity.js';
import {
  OrganizationMembershipEntity,
  OrganizationMembershipStatus,
} from './organization-membership.entity.js';
import { OrganizationRepresentativeEntity } from './organization-representative.entity.js';

const manageableRoles = new Set<OrganizationRole>([
  OrganizationRole.Admin,
  OrganizationRole.ProjectManager,
  OrganizationRole.Evaluator,
  OrganizationRole.FinanceApprover,
  OrganizationRole.Representative,
  OrganizationRole.Observer,
]);

export type InviteOrganizationMemberInput = {
  userId: string;
  role: Exclude<OrganizationRole, 'Owner'>;
};

@Injectable()
export class OrganizationMembershipService {
  constructor(private readonly dataSource: DataSource) {}

  async inviteMember(
    actorUserId: string,
    organizationId: string,
    input: InviteOrganizationMemberInput,
  ): Promise<OrganizationMembershipEntity> {
    return this.dataSource.transaction(async (manager) => {
      const organization = await this.getOrganization(manager, organizationId);
      await this.assertCanManage(manager, actorUserId, organization);

      if (!manageableRoles.has(input.role)) {
        throw new BadRequestException('Role cannot be granted by invitation');
      }

      const user = await manager.findOne(UserEntity, {
        where: { id: input.userId, status: 'Active' },
      });
      if (!user) {
        throw new NotFoundException('Active user was not found');
      }

      const repository = manager.getRepository(OrganizationMembershipEntity);
      try {
        return await repository.save(
          repository.create({
            organizationId,
            userId: input.userId,
            role: input.role,
            status: OrganizationMembershipStatus.Invited,
            invitedByUserId: actorUserId,
            acceptedAt: null,
            revokedAt: null,
          }),
        );
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          throw new ConflictException(
            'User already has an active membership or pending invitation',
          );
        }
        throw error;
      }
    });
  }

  async acceptInvitation(
    actorUserId: string,
    membershipId: string,
  ): Promise<OrganizationMembershipEntity> {
    return this.dataSource.transaction(async (manager) => {
      const membership = await manager.findOne(OrganizationMembershipEntity, {
        where: { id: membershipId, userId: actorUserId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!membership) {
        throw new NotFoundException('Invitation was not found');
      }
      if (membership.status !== OrganizationMembershipStatus.Invited) {
        throw new ConflictException('Invitation is no longer pending');
      }

      membership.status = OrganizationMembershipStatus.Active;
      membership.acceptedAt = new Date();
      return manager.save(membership);
    });
  }

  async changeRole(
    actorUserId: string,
    membershipId: string,
    role: Exclude<OrganizationRole, 'Owner'>,
  ): Promise<OrganizationMembershipEntity> {
    if (!manageableRoles.has(role)) {
      throw new BadRequestException('Role cannot be assigned to a member');
    }

    return this.dataSource.transaction(async (manager) => {
      const membership = await this.getMembership(manager, membershipId);
      const organization = await this.getOrganization(
        manager,
        membership.organizationId,
      );
      await this.assertCanManage(manager, actorUserId, organization);
      if (membership.userId === organization.ownerUserId) {
        throw new ConflictException(
          'Organization owner role cannot be changed',
        );
      }
      if (membership.status !== OrganizationMembershipStatus.Active) {
        throw new ConflictException('Only active memberships can change role');
      }
      if (
        membership.role === OrganizationRole.Representative &&
        role !== OrganizationRole.Representative
      ) {
        await manager.update(
          OrganizationRepresentativeEntity,
          {
            organizationId: membership.organizationId,
            userId: membership.userId,
            revokedAt: IsNull(),
          },
          {
            revokedAt: new Date(),
            revokedByUserId: actorUserId,
            revocationReason: 'Organization representative role removed',
          },
        );
      }
      membership.role = role;
      return manager.save(membership);
    });
  }

  async revokeMembership(
    actorUserId: string,
    membershipId: string,
  ): Promise<OrganizationMembershipEntity> {
    return this.dataSource.transaction(async (manager) => {
      const membership = await this.getMembership(manager, membershipId);
      const organization = await this.getOrganization(
        manager,
        membership.organizationId,
      );
      await this.assertCanManage(manager, actorUserId, organization);
      if (membership.userId === organization.ownerUserId) {
        throw new ConflictException(
          'Organization owner membership cannot be revoked',
        );
      }
      if (
        membership.status !== OrganizationMembershipStatus.Active &&
        membership.status !== OrganizationMembershipStatus.Invited &&
        membership.status !== OrganizationMembershipStatus.Suspended
      ) {
        throw new ConflictException('Membership is already inactive');
      }
      membership.status = OrganizationMembershipStatus.Revoked;
      membership.revokedAt = new Date();
      await manager.update(
        OrganizationRepresentativeEntity,
        {
          organizationId: membership.organizationId,
          userId: membership.userId,
          revokedAt: IsNull(),
        },
        {
          revokedAt: membership.revokedAt,
          revokedByUserId: actorUserId,
          revocationReason: 'Organization membership revoked',
        },
      );
      return manager.save(membership);
    });
  }

  async suspendMembership(
    actorUserId: string,
    membershipId: string,
  ): Promise<OrganizationMembershipEntity> {
    return this.setMembershipSuspended(actorUserId, membershipId, true);
  }

  async restoreMembership(
    actorUserId: string,
    membershipId: string,
  ): Promise<OrganizationMembershipEntity> {
    return this.setMembershipSuspended(actorUserId, membershipId, false);
  }

  async verifyRepresentative(
    actorUserId: string,
    organizationId: string,
    userId: string,
    expiresAt: Date,
    verificationReference: string,
  ): Promise<OrganizationRepresentativeEntity> {
    return this.dataSource.transaction(async (manager) => {
      const organization = await this.getOrganization(manager, organizationId);
      await this.assertCanManage(manager, actorUserId, organization);
      if (
        !Number.isFinite(expiresAt.getTime()) ||
        expiresAt.getTime() <= Date.now()
      ) {
        throw new BadRequestException(
          'Representative authority expiry must be in the future',
        );
      }
      if (
        !verificationReference.trim() ||
        verificationReference.trim().length > 500
      ) {
        throw new BadRequestException(
          'Verification reference must contain between 1 and 500 characters',
        );
      }

      const membership = await manager.findOne(OrganizationMembershipEntity, {
        where: {
          organizationId,
          userId,
          status: OrganizationMembershipStatus.Active,
        },
      });
      if (!membership) {
        throw new ConflictException(
          'Representative must have an active organization membership',
        );
      }
      if (membership.role !== OrganizationRole.Representative) {
        throw new ConflictException(
          'Membership must have the Representative role before verification',
        );
      }

      return manager.getRepository(OrganizationRepresentativeEntity).save({
        organizationId,
        userId,
        verifiedByUserId: actorUserId,
        verifiedAt: new Date(),
        expiresAt,
        revokedAt: null,
        revokedByUserId: null,
        revocationReason: null,
        verificationReference: verificationReference.trim(),
      });
    });
  }

  async revokeRepresentative(
    actorUserId: string,
    representativeId: string,
    reason: string,
  ): Promise<OrganizationRepresentativeEntity> {
    return this.dataSource.transaction(async (manager) => {
      const representative = await manager.findOne(
        OrganizationRepresentativeEntity,
        {
          where: { id: representativeId },
          lock: { mode: 'pessimistic_write' },
        },
      );
      if (!representative) {
        throw new NotFoundException('Representative authority was not found');
      }
      const organization = await this.getOrganization(
        manager,
        representative.organizationId,
      );
      await this.assertCanManage(manager, actorUserId, organization);
      if (representative.revokedAt || representative.expiresAt <= new Date()) {
        throw new ConflictException(
          'Representative authority is already inactive',
        );
      }
      if (!reason.trim() || reason.trim().length > 500) {
        throw new BadRequestException(
          'Revocation reason must contain between 1 and 500 characters',
        );
      }
      representative.revokedAt = new Date();
      representative.revokedByUserId = actorUserId;
      representative.revocationReason = reason.trim();
      return manager.save(representative);
    });
  }

  async getCurrentRepresentativeAuthority(
    organizationId: string,
    userId: string,
    now = new Date(),
  ): Promise<OrganizationRepresentativeEntity | null> {
    const authority = await this.dataSource
      .getRepository(OrganizationRepresentativeEntity)
      .createQueryBuilder('representative')
      .innerJoin(
        OrganizationMembershipEntity,
        'membership',
        'membership."organizationId" = representative."organizationId" AND membership."userId" = representative."userId" AND membership."status" = :active AND membership."role" = :representativeRole',
        {
          active: OrganizationMembershipStatus.Active,
          representativeRole: OrganizationRole.Representative,
        },
      )
      .where('representative."organizationId" = :organizationId', {
        organizationId,
      })
      .andWhere('representative."userId" = :userId', { userId })
      .andWhere('representative."verifiedAt" <= :now', { now })
      .andWhere('representative."expiresAt" > :now', { now })
      .andWhere('representative."revokedAt" IS NULL')
      .orderBy('representative."verifiedAt"', 'DESC')
      .getOne();
    return authority;
  }

  async canAcceptLegalTerms(
    actorUserId: string,
    organizationId: string,
    now = new Date(),
  ): Promise<boolean> {
    const authority = await this.getCurrentRepresentativeAuthority(
      organizationId,
      actorUserId,
      now,
    );
    const membership = await this.dataSource
      .getRepository(OrganizationMembershipEntity)
      .findOne({ where: { organizationId, userId: actorUserId } });
    const decision = authorize({
      userId: actorUserId,
      action: 'agreement.accept',
      actingOrganizationId: organizationId,
      membership: membership
        ? {
            organizationId,
            userId: actorUserId,
            role: membership.role,
            status: membership.status,
          }
        : undefined,
      representativeAuthority: authority
        ? {
            organizationId,
            userId: actorUserId,
            verifiedAt: authority.verifiedAt,
            expiresAt: authority.expiresAt,
            revokedAt: authority.revokedAt ?? undefined,
          }
        : undefined,
      now,
    });
    return decision.allowed;
  }

  private async assertCanManage(
    manager: EntityManager,
    actorUserId: string,
    organization: OrganizationEntity,
  ): Promise<void> {
    if (organization.ownerUserId === actorUserId) {
      return;
    }
    const membership = await manager.findOne(OrganizationMembershipEntity, {
      where: { organizationId: organization.id, userId: actorUserId },
    });
    const decision = authorize({
      userId: actorUserId,
      action: 'organization.manage',
      actingOrganizationId: organization.id,
      membership: membership
        ? {
            organizationId: membership.organizationId,
            userId: membership.userId,
            role: membership.role,
            status: membership.status,
          }
        : undefined,
    });
    if (!decision.allowed) {
      throw new ForbiddenException(
        'Organization management permission is required',
      );
    }
  }

  private async setMembershipSuspended(
    actorUserId: string,
    membershipId: string,
    suspended: boolean,
  ): Promise<OrganizationMembershipEntity> {
    return this.dataSource.transaction(async (manager) => {
      const membership = await this.getMembership(manager, membershipId);
      const organization = await this.getOrganization(
        manager,
        membership.organizationId,
      );
      await this.assertCanManage(manager, actorUserId, organization);
      if (membership.userId === organization.ownerUserId) {
        throw new ConflictException(
          'Organization owner membership cannot be suspended',
        );
      }
      if (
        (suspended &&
          membership.status !== OrganizationMembershipStatus.Active) ||
        (!suspended &&
          membership.status !== OrganizationMembershipStatus.Suspended)
      ) {
        throw new ConflictException('Membership is not in a suspendable state');
      }
      membership.status = suspended
        ? OrganizationMembershipStatus.Suspended
        : OrganizationMembershipStatus.Active;
      if (suspended) {
        await manager.update(
          OrganizationRepresentativeEntity,
          {
            organizationId: membership.organizationId,
            userId: membership.userId,
            revokedAt: IsNull(),
          },
          {
            revokedAt: new Date(),
            revokedByUserId: actorUserId,
            revocationReason: 'Organization membership suspended',
          },
        );
      }
      return manager.save(membership);
    });
  }

  private async getOrganization(
    manager: EntityManager,
    organizationId: string,
  ): Promise<OrganizationEntity> {
    const organization = await manager.findOne(OrganizationEntity, {
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization was not found');
    }
    return organization;
  }

  private async getMembership(
    manager: EntityManager,
    membershipId: string,
  ): Promise<OrganizationMembershipEntity> {
    const membership = await manager.findOne(OrganizationMembershipEntity, {
      where: { id: membershipId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!membership) {
      throw new NotFoundException('Organization membership was not found');
    }
    return membership;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error as QueryFailedError & { driverError?: { code?: string } })
        .driverError?.code === '23505'
    );
  }
}
