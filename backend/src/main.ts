import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve uploaded images as static files
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  // Global prefix for all routes
  app.setGlobalPrefix('api/v1');

  // Default API responses to UTF-8 JSON. PDF/static responses can still override this later.
  app.use((req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    next();
  });

  const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://tn-da22tta-nguyennhuthoa-meal-ai.vercel.app',
    'https://tn-da22tta-nguyennhuthoa-meal-ai-frontend.onrender.com',
    ...(process.env.CORS_ORIGIN || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  ];

  // Enable CORS for frontend
  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global validation pipe — auto-validates DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip unknown properties
      forbidNonWhitelisted: true,
      transform: true, // Auto-transform payloads to DTO instances
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Backend running on http://localhost:${port}/api/v1`);
}
bootstrap();
