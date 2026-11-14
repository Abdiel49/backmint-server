import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEventEntity } from './audit-event.entity.js';
import { AuditPersistenceService } from './audit-persistence.service.js';
import { IdempotencyRecordEntity } from './idempotency-record.entity.js';
import { ExternalIntegrationRecordEntity } from './external-integration-record.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AuditEventEntity,
      IdempotencyRecordEntity,
      ExternalIntegrationRecordEntity,
    ]),
  ],
  providers: [AuditPersistenceService],
  exports: [AuditPersistenceService],
})
export class AuditPersistenceModule {}
