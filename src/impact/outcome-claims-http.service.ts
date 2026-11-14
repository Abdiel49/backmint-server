import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  CreateOutcomeClaimInput,
  OutcomeClaimService,
} from './outcome-claim.service.js';
import { OutcomeClaimEntity } from './outcome-claim.entity.js';
import { OrganizationMembershipEntity } from '../organizations/organization-membership.entity.js';
import { OrganizationEntity } from '../organizations/organization.entity.js';
import { CallEntity } from '../publications/call.entity.js';
import { ProjectEntity } from '../publications/project.entity.js';

const readRoles = new Set([
  'Owner',
  'Admin',
  'ProjectManager',
  'Evaluator',
  'Observer',
]);
const manageRoles = new Set(['Owner', 'Admin', 'ProjectManager']);
const reviewRoles = new Set(['Owner', 'Admin', 'Evaluator']);

@Injectable()
export class OutcomeClaimsHttpService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly claims: OutcomeClaimService,
  ) {}

  async create(
    organizationId: string,
    userId: string,
    input: Omit<CreateOutcomeClaimInput, 'claimedByUserId'>,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const source = await this.findSource(
        manager,
        input.sourceType,
        input.sourceId,
      );
      if (source.ownerOrganizationId !== organizationId) {
        throw new NotFoundException('Outcome source was not found');
      }
      await this.assertAccess(manager, organizationId, userId, manageRoles);
      const claim = await this.claims.createSelfReported(manager, {
        ...input,
        claimedByUserId: userId,
      });
      return this.toDisclosureSafeClaim(claim);
    });
  }

  async list(
    organizationId: string,
    userId: string,
    input: {
      sourceType?: 'Project' | 'Call';
      sourceId?: string;
      limit: number;
      offset: number;
    },
  ) {
    const organization = await this.dataSource
      .getRepository(OrganizationEntity)
      .findOneBy({ id: organizationId });
    if (!organization)
      throw new NotFoundException('Organization was not found');
    await this.assertAccess(
      this.dataSource.manager,
      organizationId,
      userId,
      readRoles,
    );

    const query = this.dataSource
      .getRepository(OutcomeClaimEntity)
      .createQueryBuilder('claim');
    query.where(
      `(EXISTS (
        SELECT 1 FROM "projects" source
        WHERE claim."sourceType" = 'Project' AND source."id" = claim."sourceId" AND source."ownerOrganizationId" = :organizationId
      ) OR EXISTS (
        SELECT 1 FROM "calls" source
        WHERE claim."sourceType" = 'Call' AND source."id" = claim."sourceId" AND source."ownerOrganizationId" = :organizationId
      ))`,
      { organizationId },
    );
    if (input.sourceType)
      query.andWhere('claim."sourceType" = :sourceType', {
        sourceType: input.sourceType,
      });
    if (input.sourceId)
      query.andWhere('claim."sourceId" = :sourceId', {
        sourceId: input.sourceId,
      });
    const [items, total] = await query
      .orderBy('claim."createdAt"', 'DESC')
      .addOrderBy('claim."id"', 'ASC')
      .take(input.limit)
      .skip(input.offset)
      .getManyAndCount();
    return {
      items: items.map((claim) => this.toDisclosureSafeClaim(claim)),
      total,
      limit: input.limit,
      offset: input.offset,
    };
  }

  async review(
    organizationId: string,
    claimId: string,
    userId: string,
    note: string,
    correlationId: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const claim = await manager
        .getRepository(OutcomeClaimEntity)
        .findOneBy({ id: claimId });
      if (!claim) throw new NotFoundException('Outcome claim was not found');
      const source = await this.findSource(
        manager,
        claim.sourceType,
        claim.sourceId,
      );
      if (source.ownerOrganizationId !== organizationId) {
        throw new NotFoundException('Outcome claim was not found');
      }
      await this.assertAccess(manager, organizationId, userId, reviewRoles);
      const reviewed = await this.claims.review({
        manager,
        outcomeClaimId: claim.id,
        reviewerUserId: userId,
        provenance: 'Reviewed',
        note,
        correlationId,
      });
      return this.toDisclosureSafeClaim(reviewed);
    });
  }

  private async assertAccess(
    manager: EntityManager,
    organizationId: string,
    userId: string,
    roles: Set<string>,
  ) {
    const organization = await manager
      .getRepository(OrganizationEntity)
      .findOneBy({ id: organizationId });
    if (!organization)
      throw new NotFoundException('Organization was not found');
    if (organization.ownerUserId === userId) return;
    const membership = await manager
      .getRepository(OrganizationMembershipEntity)
      .findOneBy({ organizationId, userId, status: 'Active' });
    if (!membership) throw new NotFoundException('Organization was not found');
    if (!roles.has(membership.role))
      throw new ForbiddenException(
        'Organization membership does not allow this outcome claim action',
      );
  }

  private async findSource(
    manager: EntityManager,
    sourceType: 'Project' | 'Call',
    sourceId: string,
  ) {
    const entity = sourceType === 'Project' ? ProjectEntity : CallEntity;
    const source = await manager
      .getRepository(entity)
      .findOneBy({ id: sourceId });
    if (!source) throw new NotFoundException('Outcome source was not found');
    return source;
  }

  private toDisclosureSafeClaim(claim: OutcomeClaimEntity) {
    return {
      id: claim.id,
      sourceType: claim.sourceType,
      sourceId: claim.sourceId,
      claimedByUserId: claim.claimedByUserId,
      metricType: claim.metricType,
      value: claim.value,
      unit: claim.unit,
      evidenceSha256: claim.evidenceSha256,
      provenance: claim.provenance,
      verifierUserId: claim.verifierUserId,
      verifiedAt: claim.verifiedAt,
      createdAt: claim.createdAt,
    };
  }
}
