import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TerminusModule, HealthCheckError } from '@nestjs/terminus';
import { HealthController } from '../src/features/health/health.controller';
import { PrismaHealthIndicator } from '@nestjs/terminus';
import { PrismaService } from '../src/features/prisma/prisma.service';
import { RedisService } from '../src/features/redis/redis.service';
import { ConfigService } from '@nestjs/config';

let mockQueueClientPromise: Promise<any> = Promise.resolve({ status: 'ready' });

jest.mock('bullmq', () => {
  return {
    Queue: jest.fn().mockImplementation(() => {
      return {
        get client() {
          return mockQueueClientPromise;
        },
        close: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
      };
    }),
  };
});

describe('HealthController Readiness Integration (HTTP 503 Verification)', () => {
  let app: INestApplication;
  let prismaHealth: PrismaHealthIndicator;
  let redisService: RedisService;
  let configService: ConfigService;

  const mockRedisClient = {
    ping: jest.fn(),
  };

  const mockRedisService = {
    getClient: jest.fn().mockReturnValue(mockRedisClient),
  };

  const mockPrismaService = {};

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      if (key === 'DEMO_MODE') return false;
      if (key === 'NODE_ENV') return 'test';
      if (key === 'MINIO_ENDPOINT') return 'localhost';
      if (key === 'MINIO_PORT') return 9000;
      if (key === 'MINIO_USE_SSL') return false;
      if (key === 'MINIO_HEALTH_TIMEOUT_MS') return 1000;
      if (key === 'BULLMQ_HEALTH_TIMEOUT_MS') return 400;
      if (key === 'REDIS_HEALTH_TIMEOUT_MS') return 1000;
      if (key === 'DATABASE_HEALTH_TIMEOUT_MS') return 1000;
      if (key === 'REDIS_HOST') return '127.0.0.1';
      if (key === 'REDIS_PORT') return 6379;
      return defaultValue;
    }),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prismaHealth = moduleRef.get<PrismaHealthIndicator>(PrismaHealthIndicator);
    redisService = moduleRef.get<RedisService>(RedisService);
    configService = moduleRef.get<ConfigService>(ConfigService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    mockQueueClientPromise = Promise.resolve({ status: 'ready' });
    mockRedisClient.ping.mockResolvedValue('PONG');
    jest.spyOn(prismaHealth, 'pingCheck').mockResolvedValue({
      database: { status: 'up' },
    });
    jest.spyOn(global, 'fetch').mockImplementation(
      async () =>
        ({
          status: 200,
          ok: true,
        }) as any,
    );
  });

  it('SCENARIO 0: Baseline - All systems operational -> HTTP 200 OK', async () => {
    mockQueueClientPromise = Promise.resolve({ status: 'ready' });

    const res = await request(app.getHttpServer()).get('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.info.database.status).toBe('up');
    expect(res.body.info.redis.status).toBe('up');
    expect(res.body.info.minio.status).toBe('up');
    expect(res.body.info.bullmq.status).toBe('up');
  });

  it('SCENARIO 1: PostgreSQL failure -> Readiness MUST return HTTP 503 Service Unavailable', async () => {
    mockQueueClientPromise = Promise.resolve({ status: 'ready' });

    jest.spyOn(prismaHealth, 'pingCheck').mockRejectedValue(
      new HealthCheckError('Database ping failed', {
        database: { status: 'down', message: 'Connection to PostgreSQL severed' },
      }),
    );

    const res = await request(app.getHttpServer()).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('error');
    expect(res.body.error.database.status).toBe('down');
  });

  it('SCENARIO 2: Redis failure -> Readiness MUST return HTTP 503 Service Unavailable', async () => {
    mockQueueClientPromise = Promise.resolve({ status: 'ready' });

    mockRedisClient.ping.mockRejectedValue(new Error('ECONNREFUSED: Redis server unreachable'));

    const res = await request(app.getHttpServer()).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('error');
    expect(res.body.error.redis.status).toBe('down');
    expect(res.body.error.redis.error).toMatch(/ECONNREFUSED/i);
  });

  it('SCENARIO 3: MinIO unreachable / timeout -> Readiness MUST return HTTP 503 Service Unavailable', async () => {
    mockQueueClientPromise = Promise.resolve({ status: 'ready' });

    // MinIO connection refused
    jest.spyOn(global, 'fetch').mockRejectedValue(
      new Error('fetch failed: connect ECONNREFUSED 127.0.0.1:9000'),
    );

    const res = await request(app.getHttpServer()).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('error');
    expect(res.body.error.minio.status).toBe('down');
    expect(res.body.error.minio.error).toMatch(/ECONNREFUSED/i);
  });

  it('SCENARIO 3b: MinIO returns non-200 HTTP status (e.g. 500 / 503) -> Readiness MUST return HTTP 503', async () => {
    mockQueueClientPromise = Promise.resolve({ status: 'ready' });

    jest.spyOn(global, 'fetch').mockImplementation(
      async () =>
        ({
          status: 503,
          ok: false,
        }) as any,
    );

    const res = await request(app.getHttpServer()).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('error');
    expect(res.body.error.minio.status).toBe('down');
    expect(res.body.error.minio.error).toMatch(/returned HTTP status 503/i);
  });

  it('SCENARIO 4: BullMQ failure -> Readiness MUST return HTTP 503 Service Unavailable', async () => {
    // Queue client status is 'close' or connection rejected
    mockQueueClientPromise = Promise.resolve({ status: 'close' });

    const res = await request(app.getHttpServer()).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('error');
    expect(res.body.error.bullmq.status).toBe('down');
    expect(res.body.error.bullmq.error).toMatch(/expected 'ready'/i);
  });

  it('SCENARIO 4b: BullMQ connection error -> Readiness MUST return HTTP 503 Service Unavailable', async () => {
    mockQueueClientPromise = Promise.reject(
      new Error('BullMQ Redis connection dropped'),
    );
    // Attach noop catch to avoid unhandled rejection in event loop
    mockQueueClientPromise.catch(() => {});

    const res = await request(app.getHttpServer()).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('error');
    expect(res.body.error.bullmq.status).toBe('down');
    expect(res.body.error.bullmq.error).toMatch(/connection dropped/i);
  });

  it('SCENARIO 4c: BullMQ unresponsiveness (hanging client promise) -> Readiness MUST return HTTP 503 within finite timeout', async () => {
    // Hanging client promise that never resolves or rejects
    mockQueueClientPromise = new Promise(() => {});

    const start = Date.now();
    const res = await request(app.getHttpServer()).get('/health/ready');
    const elapsed = Date.now() - start;

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('error');
    expect(res.body.error.bullmq.status).toBe('down');
    expect(res.body.error.bullmq.error).toMatch(/timed out after/i);
    // Verified that endpoint terminated boundedly within finite time (400ms timeout + buffer < 1500ms)
    expect(elapsed).toBeGreaterThanOrEqual(350);
    expect(elapsed).toBeLessThan(1500);
  });
});
