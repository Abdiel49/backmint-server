import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '../identity/identity.module.js';
import { ApplicationEntity } from '../publications/application.entity.js';
import { AIReviewConsentEntity } from './ai-review-consent.entity.js';
import { AIReviewController } from './ai-review.controller.js';
import { AIReviewEntity } from './ai-review.entity.js';
import { AIReviewService } from './ai-review.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApplicationEntity,
      AIReviewConsentEntity,
      AIReviewEntity,
    ]),
    IdentityModule,
  ],
  controllers: [AIReviewController],
  providers: [AIReviewService],
  exports: [AIReviewService],
})
export class AIReviewModule {}
