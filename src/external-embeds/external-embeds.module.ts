import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthSessionGuard } from '../identity/auth-session.guard.js';
import { IdentityModule } from '../identity/identity.module.js';
import { OrganizationMembershipEntity } from '../organizations/organization-membership.entity.js';
import { OrganizationEntity } from '../organizations/organization.entity.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { CallEntity } from '../publications/call.entity.js';
import { ProjectEntity } from '../publications/project.entity.js';
import { ExternalEmbedEntity } from './external-embed.entity.js';
import { ExternalEmbedsController } from './external-embeds.controller.js';
import { ExternalEmbedsService } from './external-embeds.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ExternalEmbedEntity, OrganizationEntity, OrganizationMembershipEntity, ProjectEntity, CallEntity]), IdentityModule, OrganizationsModule],
  controllers: [ExternalEmbedsController],
  providers: [ExternalEmbedsService, AuthSessionGuard],
})
export class ExternalEmbedsModule {}
