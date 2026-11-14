import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFile } from 'node:fs/promises';
import { AppModule } from '../dist/app.module.js';

const app = await NestFactory.create(AppModule);

try {
  const apiPrefix = app.get(ConfigService).getOrThrow('app.apiPrefix');
  app.setGlobalPrefix(apiPrefix);
  await app.init();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Backmint API')
      .setDescription('Backmint server API documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );

  await writeFile(
    'docs/openapi.json',
    `${JSON.stringify(document, null, 2)}\n`,
  );
} finally {
  await app.close();
}
