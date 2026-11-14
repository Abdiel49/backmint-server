import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { OrganizationRole } from '../domain/authorization/authorization.js';
import {
  OrganizationMembershipEntity,
  OrganizationMembershipStatus,
} from './organization-membership.entity.js';
import {
  LegalStatus,
  OrganizationEntity,
  OrganizationType,
  OrganizationVisibility,
} from './organization.entity.js';

export type CreateOrganizationInput = {
  slug: string;
  name: string;
  organizationType: OrganizationType;
  country: string;
  legalStatus: LegalStatus;
  visibility?: OrganizationVisibility;
};

@Injectable()
export class OrganizationService {
  constructor(private readonly dataSource: DataSource) {}

  async listForUser(userId: string): Promise<OrganizationEntity[]> {
    const memberships = await this.dataSource
      .getRepository(OrganizationMembershipEntity)
      .find({
        where: {
          userId,
          status: OrganizationMembershipStatus.Active,
        },
        relations: { organization: true },
        order: { createdAt: 'ASC' },
      });

    return memberships
      .map((membership) => membership.organization)
      .filter((organization) => organization.status === 'Active');
  }

  async create(
    ownerUserId: string,
    input: CreateOrganizationInput,
  ): Promise<OrganizationEntity> {
    if (!ownerUserId.trim()) {
      throw new TypeError('Authenticated owner user ID is required');
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const organizationRepository =
          manager.getRepository(OrganizationEntity);
        const membershipRepository = manager.getRepository(
          OrganizationMembershipEntity,
        );
        const organization = await organizationRepository.save(
          organizationRepository.create({
            ...input,
            slug: input.slug.trim().toLowerCase(),
            name: input.name.trim(),
            country: input.country.trim().toUpperCase(),
            ownerUserId,
            visibility: input.visibility ?? OrganizationVisibility.Private,
            status: 'Active',
          }),
        );
        await membershipRepository.save(
          membershipRepository.create({
            organizationId: organization.id,
            userId: ownerUserId,
            role: OrganizationRole.Owner,
            status: OrganizationMembershipStatus.Active,
            invitedByUserId: ownerUserId,
            acceptedAt: organization.createdAt,
            revokedAt: null,
          }),
        );
        return organization;
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { driverError?: { code?: string } })
          .driverError?.code === '23505'
      ) {
        throw new ConflictException('Organization slug is already in use');
      }

      throw error;
    }
  }
}
