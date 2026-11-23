import { Module } from '@nestjs/common';
import { OcopLevelsController } from './ocop-levels.controller';
import { OcopLevelsService } from './ocop-levels.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [OcopLevelsController],
  providers: [OcopLevelsService],
  exports: [OcopLevelsService],
})
export class OcopLevelsModule {}
