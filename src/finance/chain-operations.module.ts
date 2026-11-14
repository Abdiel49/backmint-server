import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditPersistenceModule } from '../audit/audit-persistence.module.js';
import { NearModule } from '../infrastructure/near/near.module.js';
import { ChainOperationEntity } from './chain-operation.entity.js';
import { ChainOperationObservationEntity } from './chain-operation-observation.entity.js';
import { ChainOperationService } from './chain-operation.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChainOperationEntity,
      ChainOperationObservationEntity,
    ]),
    AuditPersistenceModule,
    NearModule,
  ],
  providers: [ChainOperationService],
  exports: [ChainOperationService],
})
export class ChainOperationsModule {}
