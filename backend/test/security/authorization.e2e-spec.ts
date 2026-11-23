import type { App } from 'supertest/types';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { RoleName } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/features/prisma/prisma.service';
import { RedisService } from '../../src/features/redis/redis.service';

describe('Authorization Security & RBAC (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;

  const usersById: Record<string, any> = {
    '00000000-0000-4000-8000-000000000001': {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'visitor@test.local',
      fullName: 'Visitor Test',
      phone: null,
      isActive: true,
      mustChangePassword: false,
      role: { name: RoleName.VISITOR },
      createdAt: new Date(),
    },
    '00000000-0000-4000-8000-000000000002': {
      id: '00000000-0000-4000-8000-000000000002',
      email: 'seller@test.local',
      fullName: 'Seller Test',
      phone: null,
      isActive: true,
      mustChangePassword: false,
      role: { name: RoleName.SELLER },
      createdAt: new Date(),
    },
    '00000000-0000-4000-8000-000000000003': {
      id: '00000000-0000-4000-8000-000000000003',
      email: 'qa@test.local',
      fullName: 'QA Test',
      phone: null,
      isActive: true,
      mustChangePassword: false,
      role: { name: RoleName.QUALITY_ASSURANCE },
      createdAt: new Date(),
    },
    '00000000-0000-4000-8000-000000000004': {
      id: '00000000-0000-4000-8000-000000000004',
      email: 'wh@test.local',
      fullName: 'Warehouse Manager Test',
      phone: null,
      isActive: true,
      mustChangePassword: false,
      role: { name: RoleName.WAREHOUSE_MANAGER },
      createdAt: new Date(),
    },
  };

  const mockPrisma = {
    user: {
      findUnique: jest.fn().mockImplementation(({ where: { id } }) => {
        return Promise.resolve(usersById[id] ?? null);
      }),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
  };

  const mockRedis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    getClient: jest.fn().mockReturnValue({
      keys: jest.fn().mockResolvedValue([]),
      del: jest.fn().mockResolvedValue(0),
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(RedisService)
      .useValue(mockRedis)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  function makeToken(role: RoleName, userId: string) {
    return jwtService.sign(
      { sub: userId, email: `${role.toLowerCase()}@test.local`, role },
      { secret: process.env.JWT_SECRET },
    );
  }

  describe('Access Control', () => {
    it('Visitor không gửi Token -> 401', () => {
      return request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    });

    it('Visitor gửi token của vai trò VISITOR khi gọi API Admin (POST /api/v1/users/sellers) -> 403', () => {
      const visitorToken = makeToken(RoleName.VISITOR, '00000000-0000-4000-8000-000000000001');
      return request(app.getHttpServer())
        .post('/api/v1/users/sellers')
        .set('Authorization', `Bearer ${visitorToken}`)
        .send({ email: 'seller@test.local', fullName: 'Seller Test', password: 'Password123!' })
        .expect(403);
    });

    it('SELLER gọi API chỉ dành riêng cho ADMIN (POST /api/v1/users/warehouse-managers) -> 403', () => {
      const sellerToken = makeToken(RoleName.SELLER, '00000000-0000-4000-8000-000000000002');
      return request(app.getHttpServer())
        .post('/api/v1/users/warehouse-managers')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ email: 'wh@test.local', fullName: 'Warehouse Test', password: 'Password123!' })
        .expect(403);
    });

    it('SELLER gọi API duyệt sản phẩm (PATCH /api/v1/products/:id/approve) -> 403', () => {
      const sellerToken = makeToken(RoleName.SELLER, '00000000-0000-4000-8000-000000000002');
      return request(app.getHttpServer())
        .patch('/api/v1/products/00000000-0000-4000-8000-000000000001/approve')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ status: 'APPROVED' })
        .expect(403);
    });

    it('WAREHOUSE_MANAGER gọi API duyệt sản phẩm -> 403', () => {
      const whToken = makeToken(RoleName.WAREHOUSE_MANAGER, '00000000-0000-4000-8000-000000000004');
      return request(app.getHttpServer())
        .patch('/api/v1/products/00000000-0000-4000-8000-000000000001/approve')
        .set('Authorization', `Bearer ${whToken}`)
        .send({ status: 'APPROVED' })
        .expect(403);
    });

    it('QUALITY_ASSURANCE gọi API Admin tạo người dùng -> 403', () => {
      const qaToken = makeToken(RoleName.QUALITY_ASSURANCE, '00000000-0000-4000-8000-000000000003');
      return request(app.getHttpServer())
        .post('/api/v1/users/quality-assurance')
        .set('Authorization', `Bearer ${qaToken}`)
        .send({ email: 'qa2@test.local', fullName: 'QA Test 2', password: 'Password123!' })
        .expect(403);
    });
  });
});
