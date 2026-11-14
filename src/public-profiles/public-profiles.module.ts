import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationEntity } from '../organizations/organization.entity.js';
import { VerificationCaseEntity } from '../verification/verification-case.entity.js';
import { ProjectEntity } from '../publications/project.entity.js';
import { CallEntity } from '../publications/call.entity.js';
import { OrganizationMembershipEntity } from '../organizations/organization-membership.entity.js';
import { IdentityModule } from '../identity/identity.module.js';
import { PublicProfileDisclosureController } from './public-profile-disclosure.controller.js';
import { PublicProfilesController } from './public-profiles.controller.js';
import { PublicProfilesService } from './public-profiles.service.js';

@Module({
  imports: [
    IdentityModule,
    TypeOrmModule.forFeature([
      OrganizationEntity,
      OrganizationMembershipEntity,
      VerificationCaseEntity,
      ProjectEntity,
      CallEntity,
    ]),
  ],
  controllers: [PublicProfilesController, PublicProfileDisclosureController],
  providers: [PublicProfilesService],
})
export class PublicProfilesModule {}
