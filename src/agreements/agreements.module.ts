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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AgreementEntity,
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
  providers: [AgreementsService],
  exports: [AgreementsService],
})
export class AgreementsModule {}
