import './env';
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService);
  const port = Number(config.get('PORT') ?? 3000);
  const corsOrigin = config.get<string>('CORS_ORIGIN');
  const isProduction = config.get<string>('NODE_ENV') === 'production';

  if (isProduction && !corsOrigin) {
    throw new Error('CORS_ORIGIN is required when NODE_ENV=production');
  }

  const allowedOrigins = corsOrigin
    ? corsOrigin
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : true;

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerEnabled = !isProduction && config.get<string>('SWAGGER_ENABLED') !== 'false';
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Producto-Backend')
      .setDescription('API Backend (NestJS + TypeORM + PostgreSQL)')
      .setVersion('0.1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        'bearer',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(port);
}

bootstrap().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  // Fail fast with the real bootstrap error so Cloud Run logs show the root cause.
  console.error(message);
  process.exit(1);
});
