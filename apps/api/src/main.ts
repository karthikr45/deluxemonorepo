import 'reflect-metadata';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // Capture the raw body for Shopify webhook HMAC verification.
  app.use(
    json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    }),
  );

  app.setGlobalPrefix('', { exclude: ['health'] });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  const origins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins.length ? origins : true, credentials: true });

  // Swagger / OpenAPI — interactive docs at /docs, raw spec at /docs-json.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Deluxe × Zenoti Loyalty Middleware')
    .setDescription(
      'Middleware that redeems Zenoti loyalty points as Shopify discount codes. ' +
        'Storefront reads balance and requests codes; points are deducted in Zenoti ' +
        'post-payment via the orders/paid webhook. 100 points = R3 (ZAR).',
    )
    .setVersion('0.1.0')
    .addTag('loyalty', 'Storefront-facing balance lookup')
    .addTag('redemptions', 'Reserve points and issue discount codes')
    .addTag('webhooks', 'Inbound Shopify webhooks (orders/paid)')
    .addTag('users', 'Linked Shopify ↔ Zenoti users')
    .addTag('stats', 'Dashboard KPIs')
    .addTag('activity', 'Activity log feed')
    .addTag('sync', 'Zenoti balance sync')
    .addTag('zenoti', 'Zenoti connectivity diagnostics')
    .addTag('health', 'Liveness')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: 'Deluxe Loyalty API',
  });

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  Logger.log(`Deluxe loyalty middleware API listening on :${port}`, 'Bootstrap');
  Logger.log(`Swagger UI: http://localhost:${port}/docs`, 'Bootstrap');
}

void bootstrap();
