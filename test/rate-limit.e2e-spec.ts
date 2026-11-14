import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types.js';

@Controller('limited')
class LimitedController {
  @Get()
  getLimitedResource() {
    return { status: 'ok' };
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 2 }],
    }),
  ],
  controllers: [LimitedController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class RateLimitTestModule {}

describe('Rate limiting (e2e)', () => {
  it('allows requests within the policy and rejects an abusive request', async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [RateLimitTestModule],
    }).compile();
    const app = moduleFixture.createNestApplication<App>({ listenOnInit: false });

    await app.init();

    await request(app.getHttpServer()).get('/limited').expect(200);
    await request(app.getHttpServer()).get('/limited').expect(200);
    await request(app.getHttpServer()).get('/limited').expect(429);

    await app.close();
  });
});
