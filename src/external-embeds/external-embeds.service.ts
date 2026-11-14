import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationMembershipEntity } from '../organizations/organization-membership.entity.js';
import { OrganizationEntity } from '../organizations/organization.entity.js';
import { CallEntity } from '../publications/call.entity.js';
import { ProjectEntity } from '../publications/project.entity.js';
import { ExternalEmbedEntity, ExternalEmbedStatus } from './external-embed.entity.js';
import type { ExternalEmbedInput, ExternalEmbedUpdate } from './external-embeds.dto.js';

const managementRoles = new Set(['Admin', 'ProjectManager']);

@Injectable()
export class ExternalEmbedsService {
  constructor(
    @InjectRepository(ExternalEmbedEntity) private readonly embeds: Repository<ExternalEmbedEntity>,
    @InjectRepository(OrganizationEntity) private readonly organizations: Repository<OrganizationEntity>,
    @InjectRepository(OrganizationMembershipEntity) private readonly memberships: Repository<OrganizationMembershipEntity>,
    @InjectRepository(ProjectEntity) private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(CallEntity) private readonly calls: Repository<CallEntity>,
  ) {}

  async create(actorUserId: string, input: ExternalEmbedInput) {
    await this.assertManager(actorUserId, input.hostOrganizationId);
    await this.assertSourceOwner(input.hostOrganizationId, input.sourceType, input.sourceId);
    return this.embeds.save(this.embeds.create({ ...input }));
  }

  async list(actorUserId: string, organizationId: string) {
    await this.assertManager(actorUserId, organizationId);
    return this.embeds.find({ where: { hostOrganizationId: organizationId }, order: { createdAt: 'DESC' } });
  }

  async update(actorUserId: string, id: string, update: ExternalEmbedUpdate) {
    const embed = await this.embeds.findOne({ where: { id } });
    if (!embed) throw new NotFoundException('External embed was not found');
    await this.assertManager(actorUserId, embed.hostOrganizationId);
    Object.assign(embed, update);
    await this.assertSourceOwner(embed.hostOrganizationId, embed.sourceType, embed.sourceId);
    return this.embeds.save(embed);
  }

  async readPublic(id: string, originHeader: string | undefined) {
    const embed = await this.embeds.findOne({ where: { id, status: ExternalEmbedStatus.Active } });
    if (!embed || embed.status !== ExternalEmbedStatus.Active) throw new NotFoundException('External embed was not found');
    const origin = this.normalizeRequestOrigin(originHeader);
    if (!embed.allowedOrigins.includes(origin)) throw new ForbiddenException('Origin is not allowed');
    const source = embed.sourceType === 'Project'
      ? await this.projects.findOne({ where: { id: embed.sourceId } })
      : await this.calls.findOne({ where: { id: embed.sourceId } });
    if (!source || source.lifecycleStatus !== 'Published' && source.lifecycleStatus !== 'Active') {
      throw new NotFoundException('Published source was not found');
    }
    if (source.visibility === 'Private') throw new NotFoundException('Published source was not found');
    const content = source.content ?? {};
    return {
      id: embed.id,
      mode: embed.mode,
      theme: embed.theme,
      scriptVersion: embed.scriptVersion,
      source: {
        sourceType: embed.sourceType,
        sourceId: source.id,
        title: source.title,
        description: source.description,
        direction: source.direction,
        visibility: source.visibility,
        lifecycleStatus: source.lifecycleStatus,
        intakeStatus: source.intakeStatus,
        publishedAt: source.publishedAt?.toISOString() ?? null,
        fundingTargetAmount: content.opportunityPolicy?.disclosurePolicy?.fundingTargetAmount === true
          ? source.fundingTargetAmount ?? null
          : null,
        targetAsset: content.opportunityPolicy?.disclosurePolicy?.targetAsset === true
          ? source.targetAsset ?? null
          : null,
        audienceTypes: content.opportunityPolicy?.disclosurePolicy?.audienceTypes === true
          ? content.audienceTypes ?? []
          : [],
        supportTypes: content.opportunityPolicy?.disclosurePolicy?.supportTypes === true
          ? content.supportTypes ?? []
          : [],
        intakeClosesAt: source.intakeClosesAt?.toISOString() ?? null,
        callToAction: { label: 'Continue to Backmint', authenticationRequired: true },
      },
    };
  }

  private async assertManager(actorUserId: string, organizationId: string) {
    const organization = await this.organizations.findOne({ where: { id: organizationId, status: 'Active' } });
    if (!organization) throw new NotFoundException('Active organization was not found');
    if (organization.ownerUserId === actorUserId) return;
    const membership = await this.memberships.findOne({ where: { organizationId, userId: actorUserId, status: 'Active' } });
    if (!membership || !managementRoles.has(membership.role)) {
      throw new ForbiddenException('Active Owner, Admin, or ProjectManager membership is required');
    }
  }

  private async assertSourceOwner(organizationId: string, sourceType: 'Project' | 'Call', sourceId: string) {
    const source = sourceType === 'Project'
      ? await this.projects.findOne({ where: { id: sourceId, ownerOrganizationId: organizationId } })
      : await this.calls.findOne({ where: { id: sourceId, ownerOrganizationId: organizationId } });
    if (!source) throw new BadRequestException('Source must belong to the host organization');
  }

  private normalizeRequestOrigin(value: string | undefined) {
    if (!value) throw new ForbiddenException('Origin header is required');
    let parsed: URL;
    try { parsed = new URL(value); } catch { throw new ForbiddenException('Origin header is invalid'); }
    if (parsed.origin !== value || parsed.protocol !== 'https:') throw new ForbiddenException('Origin header is invalid');
    return parsed.origin;
  }
}
