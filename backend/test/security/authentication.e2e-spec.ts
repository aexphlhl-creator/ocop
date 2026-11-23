import type { App } from 'supertest/types';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/features/prisma/prisma.service';

describe('Authentication Security (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;

  const mockPrisma = {
    user: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockImplementation(({ where: { id } }) => {
        if (id === '00000000-0000-4000-8000-000000000001') {
          return Promise.resolve({
            id,
            email: 'user@test.local',
            fullName: 'Test User',
            role: { name: 'VISITOR' },
            isActive: true,
            mustChangePassword: false,
          });
        }
        return Promise.resolve(null);
      }),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
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

  it('/api/v1/auth/login (POST) - Login sai password hoặc tài khoản không tồn tại trả về 401', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'test-nonexistent@example.com', password: 'wrongpassword' })
      .expect(401);
  });

  it('/api/v1/auth/login (POST) - Validation chặn body rỗng hoặc thiếu trường bắt buộc (400)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({})
      .expect(400);
  });

  it('/api/v1/auth/login (POST) - Validation chặn email sai định dạng (400)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: 'ValidPassword123!' })
      .expect(400);
  });

  it('Missing Authorization Header - Truy cập protected endpoint trả về 401', () => {
    return request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .expect(401);
  });

  it('Expired JWT - Token hết hạn bị từ chối với 401', () => {
    const expiredToken = jwtService.sign(
      { sub: '00000000-0000-4000-8000-000000000001', email: 'user@test.local', role: 'VISITOR' },
      { expiresIn: '-10s', secret: process.env.JWT_SECRET },
    );

    return request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);
  });

  it('JWT Tampering - Token bị giả mạo chữ ký bị từ chối với 401', () => {
    const validToken = jwtService.sign(
      { sub: '00000000-0000-4000-8000-000000000001', email: 'user@test.local', role: 'VISITOR' },
      { secret: 'wrong-fake-secret-key-that-does-not-match-jwt-secret' },
    );

    return request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(401);
  });

  it('Algorithm None Attack - Không cho phép JWT alg: none (401)', () => {
    const noneToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJyb2xlIjoiQURNSU4ifQ.';

    return request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${noneToken}`)
      .expect(401);
  });

  it('Refresh Token - Dùng chuỗi rác làm refresh token trả về 401', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'invalid-garbage-refresh-token' })
      .expect(401);
  });
});
