import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
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
  constructor(
    @InjectRepository(OrganizationEntity)
    private readonly organizations: Repository<OrganizationEntity>,
  ) {}

  async create(
    ownerUserId: string,
    input: CreateOrganizationInput,
  ): Promise<OrganizationEntity> {
    if (!ownerUserId.trim()) {
      throw new TypeError('Authenticated owner user ID is required');
    }

    const organization = this.organizations.create({
      ...input,
      slug: input.slug.trim().toLowerCase(),
      name: input.name.trim(),
      country: input.country.trim().toUpperCase(),
      ownerUserId,
      visibility: input.visibility ?? OrganizationVisibility.Private,
      status: 'Active',
    });

    try {
      return await this.organizations.save(organization);
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
