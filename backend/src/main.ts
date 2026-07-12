import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { PrismaClientExceptionFilter } from './common/filters/prisma-client-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AuditInterceptor } from './common/audit/audit.interceptor';
import { MetricsInterceptor } from './common/metrics/metrics.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalInterceptors(new LoggerErrorInterceptor());
  
  // Phase 4: Graceful Shutdown
  app.enableShutdownHooks();
  
  // Phase 4: Hide X-Powered-By completely
  app.disable('x-powered-by');

  const isProd = process.env.NODE_ENV === 'production';

  // Phase 4: CORS Hardening
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS ?? process.env.CORS_ORIGIN;
  let origin: string | string[] = ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://localhost:3002'];
  if (allowedOriginsEnv) {
    origin = allowedOriginsEnv.split(',').map(o => o.trim());
  } else if (isProd) {
    // If prod and no ALLOWED_ORIGINS, env.validation already fails fast.
    origin = [];
  }

  app.enableCors({
    origin,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Phase 4: Helmet & CSP
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow images/assets to be loaded
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        scriptSrc: ["'self'", isProd ? '' : "'unsafe-inline'"].filter(Boolean),
        styleSrc: ["'self'", isProd ? '' : "'unsafe-inline'"].filter(Boolean),
        imgSrc: ["'self'", "data:", "blob:", "http:", "https:"], // Allow images from MinIO or external
        connectSrc: ["'self'", "http:", "https:"], // Allow connecting to MinIO/external APIs
      },
    }
  }));

  // Phase 4: Compression
  app.use(compression({
    filter: (req: any, res: any) => {
      if (req.headers['x-no-compression']) {
        // don't compress responses with this request header
        return false;
      }
      // fallback to standard filter function
      return compression.filter(req, res);
    }
  }));

  // Phục vụ static assets (GeoJSON, media)
  app.useStaticAssets(join(process.cwd(), 'assets'), {
    prefix: '/assets/',
  });

  // Payload size limits (Phase 3 Hardening)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global Exception Filters (Order matters: more specific first)
  app.useGlobalFilters(new HttpExceptionFilter(), new PrismaClientExceptionFilter());

  // Global Interceptors
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useGlobalInterceptors(app.get(AuditInterceptor));
  app.useGlobalInterceptors(app.get(MetricsInterceptor));

  // Phase 4: Swagger Protection
  if (!isProd) {
    const config = new DocumentBuilder()
      .setTitle('OCOP Việt Nam API')
      .setDescription('Tài liệu hướng dẫn sử dụng REST API cho nền tảng Bản đồ số OCOP Việt Nam')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true, // Lưu token đăng nhập khi refresh trang
      },
    });
    app.get(Logger).log(`Swagger UI is accessible at: http://localhost:${process.env.PORT || 3000}/api/docs`);
  } else {
    app.get(Logger).log(`Swagger UI is disabled in production.`);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  app.get(Logger).log(`Backend is running on: http://localhost:${port}`);
}
bootstrap();
