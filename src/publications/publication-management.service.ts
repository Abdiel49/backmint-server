import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrganizationRole } from '../domain/authorization/authorization.js';
import {
  OrganizationMembershipEntity,
  OrganizationMembershipStatus,
} from '../organizations/organization-membership.entity.js';
import { CallEntity } from './call.entity.js';
import { ProjectEntity } from './project.entity.js';
import { PublicationService } from './publication.service.js';
import type {
  CreateCallRequest,
  CreateProjectRequest,
} from './publication-management.dto.js';
import type {
  PublicationIntake,
  PublicationLifecycle,
  PublicationVisibility,
} from './publication.types.js';

const publicationRoles = new Set<OrganizationRole>([
  OrganizationRole.Owner,
  OrganizationRole.Admin,
  OrganizationRole.ProjectManager,
]);

@Injectable()
export class PublicationManagementService {
  constructor(
    private readonly publications: PublicationService,
    private readonly dataSource: DataSource,
  ) {}

  async createProject(actorUserId: string, input: CreateProjectRequest) {
    await this.assertOrganizationAccess(actorUserId, input.ownerOrganizationId);
    return this.publications.createProject({
      ...input,
      ownerUserId: input.ownerOrganizationId ? undefined : actorUserId,
    });
  }

  async createCall(actorUserId: string, input: CreateCallRequest) {
    await this.assertOrganizationAccess(actorUserId, input.ownerOrganizationId);
    return this.publications.createCall({
      ...input,
      ownerUserId: input.ownerOrganizationId ? undefined : actorUserId,
    });
  }

  async getProject(actorUserId: string, id: string) {
    return this.assertResourceAccess(actorUserId, ProjectEntity, id);
  }

  async getCall(actorUserId: string, id: string) {
    return this.assertResourceAccess(actorUserId, CallEntity, id);
  }

  async updateProject(actorUserId: string, id: string, changes: object) {
    await this.assertResourceAccess(actorUserId, ProjectEntity, id);
    return this.publications.updateProject(id, changes);
  }

  async updateCall(actorUserId: string, id: string, changes: object) {
    await this.assertResourceAccess(actorUserId, CallEntity, id);
    return this.publications.updateCall(id, changes);
  }

  async publishProject(actorUserId: string, id: string) {
    await this.assertResourceAccess(actorUserId, ProjectEntity, id);
    return this.publications.publishProject(id);
  }

  async publishCall(actorUserId: string, id: string) {
    await this.assertResourceAccess(actorUserId, CallEntity, id);
    return this.publications.publishCall(id);
  }

  async setProjectVisibility(actorUserId: string, id: string, value: PublicationVisibility) {
    await this.assertResourceAccess(actorUserId, ProjectEntity, id);
    return this.publications.setProjectVisibility(id, value);
  }

  async setCallVisibility(actorUserId: string, id: string, value: PublicationVisibility) {
    await this.assertResourceAccess(actorUserId, CallEntity, id);
    return this.publications.setCallVisibility(id, value);
  }

  async setProjectIntake(actorUserId: string, id: string, value: PublicationIntake) {
    await this.assertResourceAccess(actorUserId, ProjectEntity, id);
    return this.publications.setProjectIntake(id, value);
  }

  async setCallIntake(actorUserId: string, id: string, value: PublicationIntake) {
    await this.assertResourceAccess(actorUserId, CallEntity, id);
    return this.publications.setCallIntake(id, value);
  }

  async transitionProject(actorUserId: string, id: string, value: PublicationLifecycle) {
    await this.assertResourceAccess(actorUserId, ProjectEntity, id);
    return this.publications.transitionProject(id, value);
  }

  async transitionCall(actorUserId: string, id: string, value: PublicationLifecycle) {
    await this.assertResourceAccess(actorUserId, CallEntity, id);
    return this.publications.transitionCall(id, value);
  }

  private async assertResourceAccess<T extends ProjectEntity | CallEntity>(
    actorUserId: string,
    entity: new () => T,
    id: string,
  ): Promise<ProjectEntity | CallEntity> {
    const resource = entity === ProjectEntity
      ? await this.dataSource.getRepository(ProjectEntity).findOne({ where: { id } })
      : await this.dataSource.getRepository(CallEntity).findOne({ where: { id } });
    if (!resource) throw new NotFoundException('Publication was not found');
    if (resource.ownerUserId === actorUserId) return resource;
    if (!resource.ownerOrganizationId) {
      throw new NotFoundException('Publication was not found');
    }
    await this.assertOrganizationAccess(actorUserId, resource.ownerOrganizationId);
    return resource;
  }

  private async assertOrganizationAccess(
    actorUserId: string,
    organizationId?: string,
  ): Promise<void> {
    if (!organizationId) return;
    const membership = await this.dataSource
      .getRepository(OrganizationMembershipEntity)
      .findOne({
        where: {
          organizationId,
          userId: actorUserId,
          status: OrganizationMembershipStatus.Active,
        },
      });
    if (!membership || !publicationRoles.has(membership.role)) {
      throw new ForbiddenException('Active Owner, Admin, or ProjectManager membership is required');
    }
  }
}
