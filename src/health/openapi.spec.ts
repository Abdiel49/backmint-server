import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller.js';

describe('health OpenAPI contract', () => {
  it('documents the prefixed path and realistic success and failure examples', async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: {} },
        { provide: TypeOrmHealthIndicator, useValue: {} },
      ],
    }).compile();
    const app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Backmint API')
        .setDescription('Backmint server API documentation')
        .setVersion('1.0')
        .build(),
    );

    expect(document.paths).toMatchSnapshot();
    await app.close();
  });
});
