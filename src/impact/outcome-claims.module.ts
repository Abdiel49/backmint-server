import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditPersistenceModule } from '../audit/audit-persistence.module.js';
import { OutcomeClaimEntity } from './outcome-claim.entity.js';
import { OutcomeClaimReviewEntity } from './outcome-claim-review.entity.js';
import { OutcomeClaimService } from './outcome-claim.service.js';
import { OutcomeClaimsController } from './outcome-claims.controller.js';
import { OutcomeClaimsHttpService } from './outcome-claims-http.service.js';
import { OrganizationMembershipEntity } from '../organizations/organization-membership.entity.js';
import { OrganizationEntity } from '../organizations/organization.entity.js';
import { ProjectEntity } from '../publications/project.entity.js';
import { CallEntity } from '../publications/call.entity.js';
import { IdentityModule } from '../identity/identity.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OutcomeClaimEntity,
      OutcomeClaimReviewEntity,
      OrganizationMembershipEntity,
      OrganizationEntity,
      ProjectEntity,
      CallEntity,
    ]),
    IdentityModule,
    AuditPersistenceModule,
  ],
  controllers: [OutcomeClaimsController],
  providers: [OutcomeClaimService, OutcomeClaimsHttpService],
  exports: [OutcomeClaimService],
})
export class OutcomeClaimsModule {}
