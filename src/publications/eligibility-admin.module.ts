import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '../identity/identity.module.js';
import { OrganizationMembershipEntity } from '../organizations/organization-membership.entity.js';
import { CallEntity } from './call.entity.js';
import { ProjectEntity } from './project.entity.js';
import {
  EligibilityRuleEntity,
  OpportunityPolicyEntity,
  QuestionEntity,
  QuestionnaireEntity,
} from './publication-auxiliary.entity.js';
import { EligibilityAdminController } from './eligibility-admin.controller.js';
import { EligibilityAdminService } from './eligibility-admin.service.js';

@Module({
  imports: [
    IdentityModule,
    TypeOrmModule.forFeature([
      ProjectEntity,
      CallEntity,
      OrganizationMembershipEntity,
      EligibilityRuleEntity,
      QuestionnaireEntity,
      QuestionEntity,
      OpportunityPolicyEntity,
    ]),
  ],
  controllers: [EligibilityAdminController],
  providers: [EligibilityAdminService],
})
export class EligibilityAdminModule {}
