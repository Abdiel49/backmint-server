import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule, ObserveInstrument } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  const configService = app.get(ConfigService);
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Blackmint API')
    .setDescription('Blackmint server API documentation')
    .setVersion('1.0')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('docs', app, documentFactory);

  await app.listen(configService.getOrThrow<number>('app.port'));
}
await bootstrap();
