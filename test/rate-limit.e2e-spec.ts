import { Controller, Get, Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import {
  RateLimitPolicy,
  UseRateLimit,
} from '../src/infrastructure/rate-limit/rate-limit.decorator.js';
import { HealthController } from '../src/health/health.controller.js';

@Controller('limited')
class LimitedController {
  @Get()
  @UseRateLimit(RateLimitPolicy.Default)
  getLimitedResource() {
    return { status: 'ok' };
  }
}

@Controller('policies')
class NamedPoliciesController {
  @Get('authentication')
  @UseRateLimit(RateLimitPolicy.Authentication)
  authentication() {
    return { status: 'ok' };
  }

  @Get('upload')
  @UseRateLimit(RateLimitPolicy.Upload)
  upload() {
    return { status: 'ok' };
  }

  @Get('financial')
  @UseRateLimit(RateLimitPolicy.Financial)
  financial() {
    return { status: 'ok' };
  }

  @Get('public-embed')
  @UseRateLimit(RateLimitPolicy.PublicEmbed)
  publicEmbed() {
    return { status: 'ok' };
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'default', ttl: 60_000, limit: 2 },
        { name: 'authentication', ttl: 60_000, limit: 1 },
        { name: 'upload', ttl: 60_000, limit: 2 },
        { name: 'financial', ttl: 60_000, limit: 3 },
        { name: 'publicEmbed', ttl: 60_000, limit: 4 },
      ],
    }),
  ],
  controllers: [LimitedController, NamedPoliciesController, HealthController],
  providers: [
    {
      provide: HealthCheckService,
      useValue: { check: async () => ({ status: 'ok' }) },
    },
    {
      provide: TypeOrmHealthIndicator,
      useValue: { pingCheck: () => ({ withTimeout: () => async () => ({}) }) },
    },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
class RateLimitTestModule {}

describe('Rate limiting (e2e)', () => {
  it('allows requests within the policy and rejects an abusive request', async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [RateLimitTestModule],
    }).compile();
    const app = moduleFixture.createNestApplication<INestApplication>();

    await app.init();

    await request(app.getHttpServer()).get('/limited').expect(200);
    await request(app.getHttpServer()).get('/limited').expect(200);
    await request(app.getHttpServer()).get('/limited').expect(429);

    await app.close();
  });

  it('applies each named policy and keeps the health endpoint available', async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [RateLimitTestModule],
    }).compile();
    const app = moduleFixture.createNestApplication<INestApplication>();

    await app.init();

    const limits = [
      ['authentication', 1],
      ['upload', 2],
      ['financial', 3],
      ['public-embed', 4],
    ] as const;

    for (const [policy, limit] of limits) {
      for (let attempt = 0; attempt < limit; attempt += 1) {
        await request(app.getHttpServer()).get(`/policies/${policy}`).expect(200);
      }

      await request(app.getHttpServer())
        .get(`/policies/${policy}`)
        .expect(429);
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer()).get('/health').expect(200);
    }

    await app.close();
  });
});
