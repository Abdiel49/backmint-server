import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ApplicationAnswerEntity, ApplicationEntity, FundingOfferEntity } from './application.entity.js';
import { AwardEntity } from './award.entity.js';
import { CallEntity } from './call.entity.js';
import { ProjectEntity } from './project.entity.js';
import { PublicationSourceType } from './publication.types.js';
import type { PublicationSnapshot } from './publication.types.js';
import { OrganizationEntity } from '../organizations/organization.entity.js';
import { assertApplicantAudience, assertApplicantJurisdiction } from './eligibility-policy.js';

type AwardSource = ProjectEntity | CallEntity;

@Injectable()
export class AwardsService {
  constructor(private readonly dataSource: DataSource) {}

  async getVisible(id: string, actorUserId: string): Promise<AwardEntity> {
    const award = await this.dataSource
      .getRepository(AwardEntity)
      .createQueryBuilder('award')
      .where('award.id = :awardId', { awardId: id })
      .andWhere(this.visibleToActorPredicate(), { actorUserId })
      .getOne();
    if (!award) throw new NotFoundException('Award not found');
    return award;
  }

  async listVisible(
    actorUserId: string,
    pagination: { limit: number; offset: number },
  ): Promise<{ items: AwardEntity[]; total: number; limit: number; offset: number }> {
    const [items, total] = await this.dataSource
      .getRepository(AwardEntity)
      .createQueryBuilder('award')
      .where(this.visibleToActorPredicate(), { actorUserId })
      .orderBy('award.expiresAt', 'DESC')
      .addOrderBy('award.id', 'ASC')
      .take(pagination.limit)
      .skip(pagination.offset)
      .getManyAndCount();
    return { items, total, ...pagination };
  }

  async createFromApplication(input: {
    applicationId: string;
    allocation: string;
    asset: string;
    expiresAt: Date;
    actorUserId: string;
    terms?: Record<string, unknown>;
  }): Promise<AwardEntity> {
    this.assertAllocation(input.allocation);
    return this.dataSource.transaction(async (manager) => {
      const application = await manager
        .getRepository(ApplicationEntity)
        .findOne({
          where: { id: input.applicationId },
          lock: { mode: 'pessimistic_write' },
        });
      if (!application) throw new NotFoundException('Application not found');
      if (application.status !== 'Selected')
        throw new BadRequestException('Application must be selected for award');
      const source = await this.lockSource(
        manager,
        application.sourceType as PublicationSourceType,
        application.sourceId,
      );
      await this.assertOwner(manager, source, input.actorUserId);
      if (source.direction !== 'FundingOffered')
        throw new BadRequestException(
          'Applications require a FundingOffered source',
        );
      if (!source.targetAsset || source.targetAsset !== input.asset)
        throw new BadRequestException(
          'Award asset must match the source asset',
        );
      const answers = await manager.getRepository(ApplicationAnswerEntity).find({
        where: { applicationId: application.id },
      });
      if (answers.some((answer) => answer.fileScanStatus !== 'NotRequired' || !Array.isArray(answer.attachmentIds) || answer.attachmentIds.length > 0))
        throw new ConflictException('Application attachments require verified scanning before an Award');
      if (application.applicantOrganizationId) {
        const organization = await manager.getRepository(OrganizationEntity).findOne({
          where: { id: application.applicantOrganizationId, status: 'Active' },
          lock: { mode: 'pessimistic_read' },
        });
        if (!organization) throw new ForbiddenException('Applicant organization is unavailable');
        const rule = (application.sourceSnapshot as PublicationSnapshot).eligibilityRule;
        if (rule) assertApplicantAudience(rule, organization.organizationType);
        assertApplicantJurisdiction(rule, organization.country);
      }
      const recipientOrganizationId = application.applicantOrganizationId;
      const recipientUserId = application.applicantUserId;
      const termsSnapshot = {
        sourceType: application.sourceType,
        sourceId: application.sourceId,
        submissionId: application.id,
        sourceSnapshot: application.sourceSnapshot,
        applicantSnapshot: application.applicantSnapshot,
        proposalSnapshot: application.proposalSnapshot,
        sourceVersion: application.sourceVersion,
        allocation: input.allocation,
        asset: input.asset,
        terms: input.terms ?? {},
      };
      const award = await this.reserve(manager, source, {
        sourceType: application.sourceType,
        sourceId: application.sourceId,
        applicationId: application.id,
        fundingOfferId: null,
        recipientOrganizationId,
        recipientUserId,
        allocation: input.allocation,
        asset: input.asset,
        expiresAt: input.expiresAt,
        termsSnapshot,
      });
      application.status = 'Awarded';
      await manager.getRepository(ApplicationEntity).save(application);
      return award;
    });
  }

  async createFromFundingOffer(input: {
    fundingOfferId: string;
    expiresAt: Date;
    actorUserId: string;
    terms?: Record<string, unknown>;
  }): Promise<AwardEntity> {
    return this.dataSource.transaction(async (manager) => {
      const offer = await manager.getRepository(FundingOfferEntity).findOne({
        where: { id: input.fundingOfferId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!offer) throw new NotFoundException('FundingOffer not found');
      if (offer.status !== 'Accepted')
        throw new BadRequestException(
          'FundingOffer must be accepted for award',
        );
      if (!offer.amount || !offer.asset)
        throw new BadRequestException(
          'An award requires a monetary FundingOffer',
        );
      const source = await this.lockSource(
        manager,
        offer.sourceType as PublicationSourceType,
        offer.sourceId,
      );
      await this.assertOwner(manager, source, input.actorUserId);
      if (source.direction !== 'FundingRequested')
        throw new BadRequestException(
          'FundingOffers require a FundingRequested source',
        );
      if (source.targetAsset && source.targetAsset !== offer.asset)
        throw new BadRequestException(
          'FundingOffer asset does not match the source asset',
        );
      const allocation = offer.amount;
      this.assertAllocation(allocation);
      const award = await this.reserve(manager, source, {
        sourceType: offer.sourceType,
        sourceId: offer.sourceId,
        applicationId: null,
        fundingOfferId: offer.id,
        recipientOrganizationId: source.ownerOrganizationId ?? null,
        recipientUserId: source.ownerUserId ?? null,
        allocation,
        asset: offer.asset,
        expiresAt: input.expiresAt,
        termsSnapshot: {
          sourceType: offer.sourceType,
          sourceId: offer.sourceId,
          submissionId: offer.id,
          sourceSnapshot: offer.sourceSnapshot,
          conditionsSnapshot: offer.conditionsSnapshot,
          sourceVersion: offer.sourceVersion,
          allocation,
          asset: offer.asset,
          supportDescription: offer.supportDescription,
          supportType: offer.supportType,
          restrictedPurpose: offer.restrictedPurpose,
          recipient: {
            organizationId: source.ownerOrganizationId ?? null,
            userId: source.ownerUserId ?? null,
          },
          funder: {
            organizationId: offer.funderOrganizationId,
            userId: offer.funderUserId,
          },
          terms: input.terms ?? {},
        },
      });
      offer.status = 'Awarded';
      await manager.getRepository(FundingOfferEntity).save(offer);
      return award;
    });
  }

  async accept(
    id: string,
    actorUserId: string,
    recipientOrganizationId?: string,
  ): Promise<AwardEntity> {
    return this.transition(
      id,
      actorUserId,
      recipientOrganizationId,
      'Accepted',
    );
  }

  async decline(
    id: string,
    actorUserId: string,
    recipientOrganizationId?: string,
  ): Promise<AwardEntity> {
    return this.transition(
      id,
      actorUserId,
      recipientOrganizationId,
      'Declined',
    );
  }

  async expire(id: string, now = new Date()): Promise<AwardEntity> {
    return this.dataSource.transaction(async (manager) => {
      const award = await this.lockAward(manager, id);
      await this.lockSource(
        manager,
        award.sourceType as PublicationSourceType,
        award.sourceId,
      );
      if (!['Offered', 'Accepted'].includes(award.state))
        throw new ConflictException(
          'Award reservation has already been released',
        );
      if (award.expiresAt > now)
        throw new BadRequestException('Award has not expired');
      return this.release(manager, award, 'Expired');
    });
  }

  private async transition(
    id: string,
    actorUserId: string,
    recipientOrganizationId: string | undefined,
    state: 'Accepted' | 'Declined',
  ): Promise<AwardEntity> {
    return this.dataSource.transaction(async (manager) => {
      const award = await this.lockAward(manager, id);
      await this.lockSource(
        manager,
        award.sourceType as PublicationSourceType,
        award.sourceId,
      );
      if (award.recipientUserId) {
        if (award.recipientUserId !== actorUserId)
          throw new ConflictException('Only the award recipient can respond');
      } else {
        if (award.recipientOrganizationId !== recipientOrganizationId)
          throw new ConflictException('Only the award recipient can respond');
        const members = await manager.query(
          'SELECT 1 FROM "organization_memberships" WHERE "organizationId" = $1 AND "userId" = $2 AND "status" = $3 AND "role" IN ($4, $5) LIMIT 1',
          [recipientOrganizationId, actorUserId, 'Active', 'Owner', 'Admin'],
        );
        if (!members.length)
          throw new ConflictException(
            'Actor cannot respond for the recipient organization',
          );
      }
      if (award.state !== 'Offered')
        throw new ConflictException('Award is no longer awaiting a response');
      if (award.expiresAt <= new Date())
        return this.release(manager, award, 'Expired');
      if (state === 'Declined') return this.release(manager, award, state);
      award.state = 'Accepted';
      award.acceptedAt = new Date();
      return manager.getRepository(AwardEntity).save(award);
    });
  }

  private async reserve(
    manager: EntityManager,
    source: AwardSource,
    input: Omit<AwardEntity, 'id' | 'state' | 'acceptedAt' | 'releasedAt'>,
  ): Promise<AwardEntity> {
    if (input.expiresAt <= new Date())
      throw new BadRequestException('Award expiry must be in the future');
    const count = await manager.getRepository(AwardEntity).count({
      where: {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        state: 'Offered',
      },
    });
    const acceptedCount = await manager.getRepository(AwardEntity).count({
      where: {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        state: 'Accepted',
      },
    });
    const maximum = this.maximumAwards(source);
    if (maximum !== undefined && count + acceptedCount >= maximum)
      throw new ConflictException(
        'Source maximum award capacity has been reached',
      );
    const spent = await manager
      .getRepository(AwardEntity)
      .createQueryBuilder('award')
      .select('COALESCE(SUM(award.allocation), 0)', 'total')
      .where(
        'award."sourceType" = :sourceType AND award."sourceId" = :sourceId AND award."asset" = :asset AND award."state" IN (:...states)',
        {
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          asset: input.asset,
          states: ['Offered', 'Accepted'],
        },
      )
      .getRawOne<{ total: string }>();
    const budget = this.budget(source);
    if (
      budget !== undefined &&
      BigInt(spent?.total ?? '0') + BigInt(input.allocation) > BigInt(budget)
    )
      throw new ConflictException(
        'Award would exceed the source hard-cap budget',
      );
    return manager.getRepository(AwardEntity).save(
      manager.getRepository(AwardEntity).create({
        ...input,
        state: 'Offered',
        acceptedAt: null,
        releasedAt: null,
      }),
    );
  }

  private async release(
    manager: EntityManager,
    award: AwardEntity,
    state: 'Declined' | 'Expired',
  ): Promise<AwardEntity> {
    if (award.releasedAt)
      throw new ConflictException(
        'Award reservation has already been released',
      );
    award.state = state;
    award.releasedAt = new Date();
    return manager.getRepository(AwardEntity).save(award);
  }

  private async lockAward(
    manager: EntityManager,
    id: string,
  ): Promise<AwardEntity> {
    const award = await manager.getRepository(AwardEntity).findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!award) throw new NotFoundException('Award not found');
    return award;
  }

  private async lockSource(
    manager: EntityManager,
    type: PublicationSourceType,
    id: string,
  ): Promise<AwardSource> {
    const repository = manager.getRepository(
      type === PublicationSourceType.Project ? ProjectEntity : CallEntity,
    );
    const source = await repository.findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!source) throw new NotFoundException(`${type} not found`);
    return source;
  }

  private async assertOwner(
    manager: EntityManager,
    source: AwardSource,
    actorUserId: string,
  ): Promise<void> {
    if (source.ownerUserId === actorUserId) return;
    if (!source.ownerOrganizationId)
      throw new ConflictException('Actor does not own the publication');
    const membership = await manager.query(
      'SELECT 1 FROM "organization_memberships" WHERE "organizationId" = $1 AND "userId" = $2 AND "status" = $3 AND "role" IN ($4, $5) LIMIT 1',
      [source.ownerOrganizationId, actorUserId, 'Active', 'Owner', 'Admin'],
    );
    if (!membership.length)
      throw new ConflictException('Actor is not authorized to issue awards');
  }

  private maximumAwards(source: AwardSource): number | undefined {
    const policy = source.content.opportunityPolicy?.maxAwards;
    const limits = [
      ...(source instanceof CallEntity && source.maximumAwards
        ? [source.maximumAwards]
        : []),
      ...(policy ? [policy] : []),
    ];
    return limits.length ? Math.min(...limits) : undefined;
  }

  private budget(source: AwardSource): string | undefined {
    if (source.hardCapEnabled && source.hardCapAmount)
      return source.hardCapAmount;
    if (source instanceof CallEntity) return source.overallBudget;
    return undefined;
  }

  private assertAllocation(value: string): void {
    if (!/^[1-9][0-9]*$/.test(value))
      throw new BadRequestException(
        'Award allocation must be a positive integer in asset base units',
      );
  }

  private visibleToActorPredicate(): string {
    return `(
      award."recipientUserId" = :actorUserId
      OR EXISTS (
        SELECT 1 FROM "organization_memberships" recipient_membership
        WHERE recipient_membership."organizationId" = award."recipientOrganizationId"
          AND recipient_membership."userId" = :actorUserId
          AND recipient_membership."status" = 'Active'
          AND recipient_membership."role" IN ('Owner', 'Admin')
      )
      OR EXISTS (
        SELECT 1 FROM "projects" project_source
        WHERE award."sourceType" = 'Project'
          AND project_source."id" = award."sourceId"
          AND (
            project_source."ownerUserId" = :actorUserId
            OR EXISTS (
              SELECT 1 FROM "organization_memberships" publisher_membership
              WHERE publisher_membership."organizationId" = project_source."ownerOrganizationId"
                AND publisher_membership."userId" = :actorUserId
                AND publisher_membership."status" = 'Active'
                AND publisher_membership."role" IN ('Owner', 'Admin')
            )
          )
      )
      OR EXISTS (
        SELECT 1 FROM "calls" call_source
        WHERE award."sourceType" = 'Call'
          AND call_source."id" = award."sourceId"
          AND (
            call_source."ownerUserId" = :actorUserId
            OR EXISTS (
              SELECT 1 FROM "organization_memberships" publisher_membership
              WHERE publisher_membership."organizationId" = call_source."ownerOrganizationId"
                AND publisher_membership."userId" = :actorUserId
                AND publisher_membership."status" = 'Active'
                AND publisher_membership."role" IN ('Owner', 'Admin')
            )
          )
      )
    )`;
  }
}
