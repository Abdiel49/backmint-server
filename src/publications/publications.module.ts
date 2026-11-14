import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CallEntity, CallVersionEntity } from './call.entity.js';
import {
  EligibilityRuleEntity,
  OpportunityPolicyEntity,
  QuestionEntity,
  QuestionnaireEntity,
} from './publication-auxiliary.entity.js';
import { OpportunityController } from './opportunity.controller.js';
import { OpportunityService } from './opportunity.service.js';
import { ProjectEntity, ProjectVersionEntity } from './project.entity.js';
import { PublicationService } from './publication.service.js';
import {
  ApplicationAnswerEntity,
  ApplicationEntity,
  FundingOfferEntity,
} from './application.entity.js';
import { ParticipationService } from './participation.service.js';
import {
  EvaluationAssignmentEntity,
  EvaluationEntity,
  EvaluationRoundEntity,
} from '../evaluations/evaluation.entity.js';
import { EvaluationsService } from '../evaluations/evaluations.service.js';
import { AwardEntity } from './award.entity.js';
import { AwardsService } from './awards.service.js';
import { AwardsController } from './awards.controller.js';
import { PublicationManagementController } from './publication-management.controller.js';
import { PublicationManagementService } from './publication-management.service.js';
import { EvaluationsController } from '../evaluations/evaluations.controller.js';
import { IdentityModule } from '../identity/identity.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { AuditPersistenceModule } from '../audit/audit-persistence.module.js';

@Module({
  imports: [
    IdentityModule,
    OrganizationsModule,
    AuditPersistenceModule,
    TypeOrmModule.forFeature([
      ProjectEntity,
      ProjectVersionEntity,
      CallEntity,
      CallVersionEntity,
      EligibilityRuleEntity,
      QuestionnaireEntity,
      QuestionEntity,
      OpportunityPolicyEntity,
      ApplicationEntity,
      ApplicationAnswerEntity,
      FundingOfferEntity,
      EvaluationRoundEntity,
      EvaluationAssignmentEntity,
      EvaluationEntity,
      AwardEntity,
    ]),
  ],
  controllers: [
    OpportunityController,
    EvaluationsController,
    PublicationManagementController,
    AwardsController,
  ],
  providers: [
    PublicationService,
    OpportunityService,
    ParticipationService,
    EvaluationsService,
    AwardsService,
    PublicationManagementService,
  ],
  exports: [
    PublicationService,
    OpportunityService,
    ParticipationService,
    EvaluationsService,
    AwardsService,
    PublicationManagementService,
  ],
})
export class PublicationsModule {}
