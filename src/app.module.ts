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
  queuesConfig,
  redisConfig,
} from './config/configuration.js';
import { HealthModule } from './health/health.module.js';
import { AsyncQueuesModule } from './infrastructure/async-queues/async-queues.module.js';
import { NearModule } from './infrastructure/near/near.module.js';
import { ObjectStorageModule } from './infrastructure/object-storage/object-storage.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';

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
    ObjectStorageModule,
    NearModule,
    OrganizationsModule,
    HealthModule,
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
