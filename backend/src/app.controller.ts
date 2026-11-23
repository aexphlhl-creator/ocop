import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { PrismaService } from './features/prisma/prisma.service';
import { RedisService } from './features/redis/redis.service';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @ApiOperation({ summary: 'Kiểm tra trạng thái hệ thống và kết nối DB/Redis' })
  @ApiResponse({ status: 200, description: 'Trả về trạng thái sức khỏe' })
  async getHealth() {
    let databaseStatus = 'disconnected';
    let redisStatus = 'disconnected';

    try {
      await this.prismaService.$queryRaw`SELECT 1`;
      databaseStatus = 'connected';
    } catch (e) {
      databaseStatus = `error: ${e instanceof Error ? e.message : 'Unknown'}`;
    }

    try {
      const pingRes = await this.redisService.getClient().ping();
      if (pingRes === 'PONG') {
        redisStatus = 'connected';
      }
    } catch (e) {
      redisStatus = `error: ${e instanceof Error ? e.message : 'Unknown'}`;
    }

    const uptime = process.uptime();

    return {
      status:
        databaseStatus === 'connected' && redisStatus === 'connected'
          ? 'ok'
          : 'error',
      database: databaseStatus,
      redis: redisStatus,
      uptime: `${Math.floor(uptime)}s`,
    };
  }
}
