import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
import { OrganizationMembershipEntity } from '../organizations/organization-membership.entity.js';
import { OrganizationRepresentativeEntity } from '../organizations/organization-representative.entity.js';
import {
  ApplicationAnswerEntity,
  ApplicationEntity,
  FundingOfferEntity,
} from '../publications/application.entity.js';
import { CallEntity } from '../publications/call.entity.js';
import { ProjectEntity } from '../publications/project.entity.js';
import { PublicationSourceType } from '../publications/publication.types.js';
import { ParticipationService } from '../publications/participation.service.js';

type Source = ProjectEntity | CallEntity;
type SourceType =
  (typeof PublicationSourceType)[keyof typeof PublicationSourceType];
type ApplicationInput = {
  sourceType: SourceType;
  sourceId: string;
  applicantOrganizationId?: string;
  referencedProjectId?: string;
  proposal: Record<string, unknown>;
  answers: Array<{
    questionKey: string;
    answer: unknown;
    attachmentIds?: string[];
  }>;
};
type FundingOfferInput = {
  sourceType: SourceType;
  sourceId: string;
  funderOrganizationId?: string;
  amount?: string;
  asset?: string;
  supportDescription?: string;
  supportType?: string;
  restrictedPurpose?: string;
  conditions: Record<string, unknown>;
};
type Page = { limit: number; offset: number };

const applicationRoles = ['Owner', 'Admin', 'ProjectManager', 'Representative'];
const fundingRoles = ['Owner', 'Admin', 'FinanceApprover', 'Representative'];
const reviewerRoles = ['Owner', 'Admin', 'Evaluator'];

@Injectable()
export class ParticipationHttpService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly participation: ParticipationService,
  ) {}

  async submitApplication(actorUserId: string, input: ApplicationInput) {
    await this.assertSubmittableSource(
      input.sourceType,
      input.sourceId,
      'FundingOffered',
    );
    if (input.applicantOrganizationId) {
      await this.assertActiveOrganizationRole(
        actorUserId,
        input.applicantOrganizationId,
        applicationRoles,
      );
    }
    return this.participation.submitApplication({
      ...input,
      applicantUserId: input.applicantOrganizationId ? undefined : actorUserId,
    });
  }

  async listApplications(actorUserId: string, page: Page) {
    const query = this.dataSource
      .getRepository(ApplicationEntity)
      .createQueryBuilder('application');
    query.where('application."applicantUserId" = :actorUserId', {
      actorUserId,
    });
    query.orWhere(
      `application."applicantOrganizationId" IN (
        SELECT membership."organizationId" FROM organization_memberships membership
        WHERE membership."userId" = :actorUserId AND membership."status" = 'Active'
        AND membership."role" IN (:...roles)
        AND (membership."role" <> 'Representative' OR EXISTS (
          SELECT 1 FROM organization_representatives representative
          WHERE representative."organizationId" = membership."organizationId"
          AND representative."userId" = membership."userId"
          AND representative."verifiedAt" <= now()
          AND representative."expiresAt" > now()
          AND representative."revokedAt" IS NULL
        ))
      )`,
      { actorUserId, roles: applicationRoles },
    );
    const [items, total] = await query
      .orderBy('application."submittedAt"', 'DESC')
      .take(page.limit)
      .skip(page.offset)
      .getManyAndCount();
    const answers = items.length
      ? await this.dataSource
          .getRepository(ApplicationAnswerEntity)
          .findBy({ applicationId: In(items.map((item) => item.id)) })
      : [];
    const answersByApplication = new Map<string, ApplicationAnswerEntity[]>();
    for (const answer of answers) {
      const group = answersByApplication.get(answer.applicationId) ?? [];
      group.push(answer);
      answersByApplication.set(answer.applicationId, group);
    }
    return {
      items: items.map((item) =>
        Object.assign({}, item, {
          answers: answersByApplication.get(item.id) ?? [],
        }),
      ),
      total,
      ...page,
    };
  }

  async submitFundingOffer(actorUserId: string, input: FundingOfferInput) {
    await this.assertSubmittableSource(
      input.sourceType,
      input.sourceId,
      'FundingRequested',
    );
    if (input.funderOrganizationId) {
      await this.assertActiveOrganizationRole(
        actorUserId,
        input.funderOrganizationId,
        fundingRoles,
      );
    }
    return this.participation.submitFundingOffer({
      ...input,
      funderUserId: input.funderOrganizationId ? undefined : actorUserId,
    });
  }

  listFundingOffers(actorUserId: string, page: Page) {
    const query = this.dataSource
      .getRepository(FundingOfferEntity)
      .createQueryBuilder('offer');
    query.where('offer."funderUserId" = :actorUserId', { actorUserId });
    query.orWhere(
      `offer."funderOrganizationId" IN (
        SELECT membership."organizationId" FROM organization_memberships membership
        WHERE membership."userId" = :actorUserId AND membership."status" = 'Active'
        AND membership."role" IN (:...roles)
        AND (membership."role" <> 'Representative' OR EXISTS (
          SELECT 1 FROM organization_representatives representative
          WHERE representative."organizationId" = membership."organizationId"
          AND representative."userId" = membership."userId"
          AND representative."verifiedAt" <= now()
          AND representative."expiresAt" > now()
          AND representative."revokedAt" IS NULL
        ))
      )`,
      { actorUserId, roles: fundingRoles },
    );
    return query
      .orderBy('offer."submittedAt"', 'DESC')
      .take(page.limit)
      .skip(page.offset)
      .getManyAndCount()
      .then(([items, total]) => ({ items, total, ...page }));
  }

  async reviewFundingOffer(
    actorUserId: string,
    offerId: string,
    decision: 'UnderReview' | 'Accepted' | 'Declined',
  ) {
    const offer = await this.dataSource
      .getRepository(FundingOfferEntity)
      .findOneBy({ id: offerId });
    if (!offer) throw new NotFoundException('FundingOffer not found');
    const source = await this.loadSource(
      offer.sourceType as SourceType,
      offer.sourceId,
    );
    if (source.ownerUserId !== actorUserId) {
      if (!source.ownerOrganizationId)
        throw new ForbiddenException(
          'Only the source owner may review this offer',
        );
      await this.assertActiveOrganizationRole(
        actorUserId,
        source.ownerOrganizationId,
        reviewerRoles,
      );
    }
    return this.participation.reviewFundingOffer(
      offerId,
      actorUserId,
      decision,
    );
  }

  private async assertSubmittableSource(
    sourceType: SourceType,
    sourceId: string,
    direction: 'FundingOffered' | 'FundingRequested',
  ) {
    const source = await this.loadSource(sourceType, sourceId);
    if (source.visibility === 'Private')
      throw new NotFoundException('Publication not found');
    if (source.direction !== direction)
      throw new BadRequestException(
        'Submission direction does not match source',
      );
  }

  private async loadSource(
    sourceType: SourceType,
    sourceId: string,
  ): Promise<Source> {
    const repository =
      sourceType === PublicationSourceType.Project
        ? this.dataSource.getRepository(ProjectEntity)
        : this.dataSource.getRepository(CallEntity);
    const source = await repository.findOneBy({ id: sourceId } as never);
    if (!source) throw new NotFoundException('Publication not found');
    return source;
  }

  private async assertActiveOrganizationRole(
    actorUserId: string,
    organizationId: string,
    roles: string[],
  ) {
    const membership = await this.dataSource
      .getRepository(OrganizationMembershipEntity)
      .findOneBy({
        organizationId,
        userId: actorUserId,
        status: 'Active',
      });
    if (
      !membership ||
      membership.status !== 'Active' ||
      membership.organizationId !== organizationId ||
      membership.userId !== actorUserId ||
      !roles.includes(membership.role)
    ) {
      throw new ForbiddenException(
        'An active organization membership with an authorized role is required',
      );
    }
    if (membership.role === 'Representative') {
      const authority = await this.dataSource
        .getRepository(OrganizationRepresentativeEntity)
        .findOneBy({
          organizationId,
          userId: actorUserId,
          revokedAt: IsNull(),
        });
      const now = Date.now();
      if (
        !authority ||
        authority.verifiedAt.getTime() > now ||
        authority.expiresAt.getTime() <= now
      ) {
        throw new ForbiddenException(
          'A current verified organization representative authority is required',
        );
      }
    }
  }
}
