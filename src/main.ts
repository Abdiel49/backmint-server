import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule, ObserveInstrument } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  const configService = app.get(ConfigService);
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
