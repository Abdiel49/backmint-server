import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import {
  appConfig,
  databaseConfig,
  nearConfig,
  objectStorageConfig,
  observeConfig,
  walletConfig,
  queuesConfig,
  redisConfig,
} from './config/configuration.js';
import { HealthModule } from './health/health.module.js';
import { AsyncQueuesModule } from './infrastructure/async-queues/async-queues.module.js';
import { NearModule } from './infrastructure/near/near.module.js';
import { ObjectStorageModule } from './infrastructure/object-storage/object-storage.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { OutboxModule } from './infrastructure/outbox/outbox.module.js';
import { PublicationsModule } from './publications/publications.module.js';
import { AuditPersistenceModule } from './audit/audit-persistence.module.js';
import { OutcomeClaimsModule } from './impact/outcome-claims.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { VerificationModule } from './verification/verification.module.js';
import { ChainOperationsModule } from './finance/chain-operations.module.js';
import { AIReviewModule } from './ai-review/ai-review.module.js';
import { ParticipationModule } from './participation/participation.module.js';
import { AgreementsModule } from './agreements/agreements.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [
        appConfig,
        databaseConfig,
        redisConfig,
        queuesConfig,
        objectStorageConfig,
        nearConfig,
        observeConfig,
        walletConfig,
      ],
    }),
    ObserveModule.forRootAsync({
      inject: [observeConfig.KEY],
      useFactory: (observe: ConfigType<typeof observeConfig>) => ({
        appKey: observe.appKey,
        appSecret: observe.appSecret,
        serviceId: observe.serviceId,
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [databaseConfig.KEY],
      useFactory: (database: ConfigType<typeof databaseConfig>) => ({
        type: 'postgres',
        host: database.host,
        port: database.port,
        username: database.username,
        password: database.password,
        database: database.name,
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (app: ConfigType<typeof appConfig>) => ({
        throttlers: [
          {
            name: 'default',
            ttl: app.rateLimitTtl,
            limit: app.rateLimitMaxRequests,
          },
          {
            name: 'authentication',
            ttl: app.rateLimitTtl,
            limit: app.authenticationRateLimitMaxRequests,
          },
          {
            name: 'upload',
            ttl: app.rateLimitTtl,
            limit: app.uploadRateLimitMaxRequests,
          },
          {
            name: 'financial',
            ttl: app.rateLimitTtl,
            limit: app.financialRateLimitMaxRequests,
          },
          {
            name: 'publicEmbed',
            ttl: app.rateLimitTtl,
            limit: app.publicEmbedRateLimitMaxRequests,
          },
        ],
      }),
    }),
    BullModule.forRootAsync({
      inject: [redisConfig.KEY],
      useFactory: (redis: ConfigType<typeof redisConfig>) => ({
        connection: {
          host: redis.host,
          port: redis.port,
          password: redis.password,
        },
      }),
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    AsyncQueuesModule,
    OutboxModule,
    AuditPersistenceModule,
    OutcomeClaimsModule,
    ObjectStorageModule,
    NearModule,
    IdentityModule,
    OrganizationsModule,
    HealthModule,
    IdentityModule,
    PublicationsModule,
    NotificationsModule,
    VerificationModule,
    ChainOperationsModule,
    AIReviewModule,
    ParticipationModule,
    AgreementsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
