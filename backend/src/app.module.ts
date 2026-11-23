import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { validate } from './config/env.validation';
import { LoggerModule } from 'nestjs-pino';
import { ClsModule } from 'nestjs-cls';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { randomUUID } from 'crypto';
import type { Request } from 'express';
import { PrismaModule } from './features/prisma/prisma.module';
import { RedisModule } from './features/redis/redis.module';
import { AuthModule } from './features/auth/auth.module';
import { ProvincesModule } from './features/provinces/provinces.module';
import { WardsModule } from './features/wards/wards.module';
import { ProductsModule } from './features/products/products.module';
import { BusinessesModule } from './features/businesses/businesses.module';
import { HealthModule } from './features/health/health.module';
import { AuditModule } from './common/audit/audit.module';
import { MetricsModule } from './common/metrics/metrics.module';
import { MediaModule } from './features/media/media.module';
import { NewsModule } from './features/news/news.module';
import { DashboardModule } from './features/dashboard/dashboard.module';
import { StatisticsModule } from './features/statistics/statistics.module';
import { NotificationsModule } from './features/notifications/notifications.module';
import { OrdersModule } from './features/orders/orders.module';
import { PaymentsModule } from './features/payments/payments.module';
import { ReviewsModule } from './features/reviews/reviews.module';
import { VouchersModule } from './features/vouchers/vouchers.module';
import { BlockchainModule } from './features/blockchain/blockchain.module';
import { BlockchainQueueModule } from './features/blockchain-queue/blockchain-queue.module';
import { InventoryModule } from './features/inventory/inventory.module';
import { SupplyChainModule } from './features/supply-chain/supply-chain.module';
import { CertificatesModule } from './features/certificates/certificates.module';
import { TraceabilityModule } from './features/traceability/traceability.module';
import { UsersModule } from './features/users/users.module';

import { ThrottlerModule } from '@nestjs/throttler';
import { EventsModule } from './features/events/events.module';
import { CategoriesModule } from './features/categories/categories.module';
import { OcopLevelsModule } from './features/ocop-levels/ocop-levels.module';
import { ShipmentsModule } from './features/shipments/shipments.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      validate,
    }),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        setup: (cls, req: Request) => {
          const reqId = req.headers['x-correlation-id'] || randomUUID();
          cls.set('reqId', reqId);
        },
      },
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (req) =>
          req.headers['x-correlation-id'] || req.id || randomUUID(),
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-api-key"]',
          ],
          censor: '[REDACTED]',
        },
      },
    }),
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: {
        enabled: true,
      },
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    AuthModule,
    ProvincesModule,
    WardsModule,
    ProductsModule,
    BusinessesModule,
    HealthModule,
    AuditModule,
    MetricsModule,
    MediaModule,
    NewsModule,
    DashboardModule,
    StatisticsModule,
    NotificationsModule,
    OrdersModule,
    PaymentsModule,
    ReviewsModule,
    VouchersModule,
    BlockchainModule,
    BlockchainQueueModule,
    InventoryModule,
    SupplyChainModule,
    CertificatesModule,
    TraceabilityModule,
    UsersModule,
    EventsModule,
    ShipmentsModule,
    CategoriesModule,
    OcopLevelsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
