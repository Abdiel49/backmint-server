import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationEntity } from './organization.entity.js';
import { OrganizationMembershipEntity } from './organization-membership.entity.js';
import { OrganizationRepresentativeEntity } from './organization-representative.entity.js';
import { OrganizationService } from './organization.service.js';
import { OrganizationMembershipService } from './organization-membership.service.js';
import { OrganizationsController } from './organizations.controller.js';
import { IdentityModule } from '../identity/identity.module.js';

@Module({
  imports: [
    IdentityModule,
    TypeOrmModule.forFeature([
      OrganizationEntity,
      OrganizationMembershipEntity,
      OrganizationRepresentativeEntity,
    ]),
  ],
  providers: [OrganizationService, OrganizationMembershipService],
  controllers: [OrganizationsController],
  exports: [OrganizationService, OrganizationMembershipService],
})
export class OrganizationsModule {}
