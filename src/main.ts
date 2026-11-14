import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { RequestLoggingInterceptor } from './http/request-logging.interceptor.js';
import { AppModule, ObserveInstrument } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  const configService = app.get(ConfigService);
  const expressInstance = app.getHttpAdapter().getInstance();
  expressInstance.set(
    'trust proxy',
    configService.getOrThrow<number>('app.trustedProxyHops'),
  );
  app.use((request: Request, response: Response, next: NextFunction) => {
    const suppliedRequestId = request.headers['x-request-id'];
    const requestId =
      typeof suppliedRequestId === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(suppliedRequestId)
        ? suppliedRequestId
        : randomUUID();
    Object.assign(request, { id: requestId });
    response.setHeader('x-request-id', requestId);
    next();
  });
  app.useGlobalInterceptors(new RequestLoggingInterceptor());
  app.enableShutdownHooks();
  app.enableCors({
    origin: configService.getOrThrow<string[]>('app.corsOrigins'),
    credentials: true,
  });
  app.setGlobalPrefix(configService.getOrThrow<string>('app.apiPrefix'));
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Backmint API')
    .setDescription('Backmint server API documentation')
    .setVersion('1.0')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup(
    configService.getOrThrow<string>('app.swaggerPath'),
    app,
    documentFactory,
    {
      jsonDocumentUrl: configService.getOrThrow<string>('app.swaggerJsonPath'),
    },
  );

  await app.listen(configService.getOrThrow<number>('app.port'));
}
await bootstrap();
