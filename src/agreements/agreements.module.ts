import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgreementsService } from './agreements.service.js';
import {
  AgreementEntity,
  AgreementFinanceConfirmationEntity,
  AgreementPartyAcceptanceEntity,
  AgreementVersionEntity,
} from './agreement.entity.js';
import { AwardEntity } from '../publications/award.entity.js';
import { ChainOperationEntity } from '../finance/chain-operation.entity.js';
import { OrganizationEntity } from '../organizations/organization.entity.js';
import { OrganizationMembershipEntity } from '../organizations/organization-membership.entity.js';
import { OrganizationRepresentativeEntity } from '../organizations/organization-representative.entity.js';
import { IdentityModule } from '../identity/identity.module.js';
import { AgreementAcceptanceController } from './agreement-acceptance.controller.js';
import { AgreementAcceptanceChallengeEntity } from './agreement-acceptance-challenge.entity.js';

@Module({
  imports: [
    IdentityModule,
    TypeOrmModule.forFeature([
      AgreementEntity,
      AgreementAcceptanceChallengeEntity,
      AgreementVersionEntity,
      AgreementPartyAcceptanceEntity,
      AgreementFinanceConfirmationEntity,
      AwardEntity,
      ChainOperationEntity,
      OrganizationEntity,
      OrganizationMembershipEntity,
      OrganizationRepresentativeEntity,
    ]),
  ],
  controllers: [AgreementAcceptanceController],
  providers: [AgreementsService],
  exports: [AgreementsService],
})
export class AgreementsModule {}
