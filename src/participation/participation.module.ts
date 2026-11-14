import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '../identity/identity.module.js';
import { OrganizationMembershipEntity } from '../organizations/organization-membership.entity.js';
import { OrganizationRepresentativeEntity } from '../organizations/organization-representative.entity.js';
import { PublicationsModule } from '../publications/publications.module.js';
import {
  ApplicationAnswerEntity,
  ApplicationEntity,
  FundingOfferEntity,
} from '../publications/application.entity.js';
import { CallEntity } from '../publications/call.entity.js';
import { ProjectEntity } from '../publications/project.entity.js';
import { ParticipationController } from './participation.controller.js';
import { ParticipationHttpService } from './participation-http.service.js';

@Module({
  imports: [
    IdentityModule,
    PublicationsModule,
    TypeOrmModule.forFeature([
      OrganizationMembershipEntity,
      OrganizationRepresentativeEntity,
      ApplicationEntity,
      ApplicationAnswerEntity,
      FundingOfferEntity,
      ProjectEntity,
      CallEntity,
    ]),
  ],
  controllers: [ParticipationController],
  providers: [ParticipationHttpService],
})
export class ParticipationModule {}
