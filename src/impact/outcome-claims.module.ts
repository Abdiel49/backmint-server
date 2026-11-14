import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditPersistenceModule } from '../audit/audit-persistence.module.js';
import { OutcomeClaimEntity } from './outcome-claim.entity.js';
import { OutcomeClaimReviewEntity } from './outcome-claim-review.entity.js';
import { OutcomeClaimService } from './outcome-claim.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([OutcomeClaimEntity, OutcomeClaimReviewEntity]),
    AuditPersistenceModule,
  ],
  providers: [OutcomeClaimService],
  exports: [OutcomeClaimService],
})
export class OutcomeClaimsModule {}
