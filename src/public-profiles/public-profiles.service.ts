import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  OrganizationEntity,
  OrganizationVisibility,
} from '../organizations/organization.entity.js';
import {
  VerificationCaseEntity,
  VerificationStatus,
} from '../verification/verification-case.entity.js';
import { CallEntity } from '../publications/call.entity.js';
import { ProjectEntity } from '../publications/project.entity.js';
import { PublicationVisibility } from '../publications/publication.types.js';
import {
  OrganizationMembershipEntity,
  OrganizationMembershipStatus,
} from '../organizations/organization-membership.entity.js';

@Injectable()
export class PublicProfilesService {
  constructor(
    @InjectRepository(OrganizationEntity)
    private readonly organizations: Repository<OrganizationEntity>,
    @InjectRepository(VerificationCaseEntity)
    private readonly verifications: Repository<VerificationCaseEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(CallEntity)
    private readonly calls: Repository<CallEntity>,
    @InjectRepository(OrganizationMembershipEntity)
    private readonly memberships: Repository<OrganizationMembershipEntity>,
  ) {}

  async listOrganizations(limit: number, offset: number) {
    const [rows, total] = await this.organizations.findAndCount({
      where: { visibility: OrganizationVisibility.Public, status: 'Active' },
      order: { slug: 'ASC', id: 'ASC' },
      take: limit,
      skip: offset,
    });
    return {
      items: await Promise.all(
        rows.map((row) => this.organizationProjection(row)),
      ),
      total,
      limit,
      offset,
    };
  }

  async organization(identifier: string) {
    const row = await this.organizations.findOne({
      where: [
        {
          slug: identifier,
          visibility: OrganizationVisibility.Public,
          status: 'Active',
        },
        {
          id: identifier,
          visibility: OrganizationVisibility.Public,
          status: 'Active',
        },
        {
          id: identifier,
          visibility: OrganizationVisibility.Unlisted,
          status: 'Active',
        },
      ],
    });
    if (!row) throw new NotFoundException('Public profile was not found');
    return this.organizationProjection(row);
  }

  async setVerificationDisclosure(
    actorUserId: string,
    organizationId: string,
    disclose: boolean,
  ) {
    const membership = await this.memberships.findOne({
      where: {
        organizationId,
        userId: actorUserId,
        status: OrganizationMembershipStatus.Active,
      },
    });
    if (!membership || !['Owner', 'Admin'].includes(membership.role)) {
      throw new ForbiddenException(
        'Organization owner or admin permission is required',
      );
    }
    const organization = await this.organizations.findOneBy({
      id: organizationId,
    });
    if (!organization)
      throw new NotFoundException('Organization was not found');
    organization.discloseVerificationStatus = disclose;
    return this.organizations.save(organization);
  }

  async opportunity(sourceType: 'Project' | 'Call', id: string) {
    const row =
      sourceType === 'Project'
        ? await this.projects.findOneBy({ id })
        : await this.calls.findOneBy({ id });
    if (
      !row ||
      !['Published', 'Active'].includes(row.lifecycleStatus) ||
      ![PublicationVisibility.Public, PublicationVisibility.Unlisted].includes(
        row.visibility as never,
      )
    ) {
      throw new NotFoundException('Public profile was not found');
    }
    const snapshot = row.content;
    const disclosure = snapshot.opportunityPolicy?.disclosurePolicy ?? {};
    const profile: Record<string, unknown> = {
      sourceType,
      id: row.id,
      title: row.title,
      description: row.description,
      direction: row.direction,
      lifecycleStatus: row.lifecycleStatus,
      intakeStatus: row.intakeStatus,
      publishedAt: row.publishedAt?.toISOString() ?? null,
    };
    for (const field of [
      'fundingTargetAmount',
      'targetAsset',
      'audienceTypes',
      'supportTypes',
      'objectives',
      'deliverables',
      'maximumAwards',
      'allocationMode',
      'fixedAwardAmount',
      'overallBudget',
    ] as const) {
      if (disclosure[field] === true && snapshot[field] !== undefined)
        profile[field] = snapshot[field];
    }
    if (disclosure.intakeClosesAt === true && snapshot.intakeClosesAt)
      profile.intakeClosesAt = snapshot.intakeClosesAt;
    if (row.ownerOrganizationId) {
      const organization = await this.organizations.findOneBy({
        id: row.ownerOrganizationId,
        status: 'Active',
        visibility: OrganizationVisibility.Public,
      });
      if (organization)
        profile.organization = {
          slug: organization.slug,
          name: organization.name,
        };
    }
    return profile;
  }

  private async organizationProjection(row: OrganizationEntity) {
    const profile: Record<string, unknown> = {
      id: row.id,
      slug: row.slug,
      name: row.name,
      organizationType: row.organizationType,
      country: row.country,
      legalStatus: row.legalStatus,
    };
    if (row.discloseVerificationStatus) {
      const verification = await this.verifications.findOneBy({
        organizationId: row.id,
      });
      const verified =
        verification?.status === VerificationStatus.Verified &&
        (!verification.expiresAt || verification.expiresAt > new Date()) &&
        !verification.revokedAt;
      profile.verification = { status: verified ? 'Verified' : 'NotVerified' };
    }
    return profile;
  }
}
