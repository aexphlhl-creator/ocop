import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { validate } from './config/env.validation';
import { PrismaModule } from './features/prisma/prisma.module';
import { RedisModule } from './features/redis/redis.module';
import { AuthModule } from './features/auth/auth.module';
import { ProvincesModule } from './features/provinces/provinces.module';
import { WardsModule } from './features/wards/wards.module';
import { ProductsModule } from './features/products/products.module';
import { BusinessesModule } from './features/businesses/businesses.module';
import { MediaModule } from './features/media/media.module';
import { NewsModule } from './features/news/news.module';
import { DashboardModule } from './features/dashboard/dashboard.module';
import { StatisticsModule } from './features/statistics/statistics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      validate,
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    ProvincesModule,
    WardsModule,
    ProductsModule,
    BusinessesModule,
    MediaModule,
    NewsModule,
    DashboardModule,
    StatisticsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
