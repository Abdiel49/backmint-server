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

@Module({
  imports: [
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
    ]),
  ],
  controllers: [OpportunityController],
  providers: [
    PublicationService,
    OpportunityService,
    ParticipationService,
    EvaluationsService,
  ],
  exports: [
    PublicationService,
    OpportunityService,
    ParticipationService,
    EvaluationsService,
  ],
})
export class PublicationsModule {}
