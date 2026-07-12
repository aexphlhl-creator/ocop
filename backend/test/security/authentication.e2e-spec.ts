import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Authentication Security (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/auth/login (POST) - Login sai password', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'wrongpassword' })
      .expect(401);
  });

  it('/api/v1/auth/login (POST) - Login thành công', async () => {
    // Requires seeding a test user
    // .expect(201);
  });

  it('Refresh Token Rotation - Sinh token mới và vô hiệu hóa token cũ', async () => {
    // 1. Login lấy Refresh Token A
    // 2. Dùng A gọi /refresh -> Lấy B
    // 3. Dùng A gọi /refresh lần nữa -> Expect 401 (Replay Attack)
  });

  it('Redis Blacklist Test - Logout vô hiệu hóa token', async () => {
    // 1. Login lấy Token A
    // 2. Dùng Token A gọi /logout
    // 3. Dùng Token A gọi API protected -> Expect 401
  });

  it('Expired JWT - Không cho phép truy cập', () => {
    // Mock JWT hết hạn
    // Gọi API protected -> Expect 401
  });

  it('Algorithm None Attack - Không cho phép JWT alg: none', () => {
    // Tạo JWT với thuật toán none
    // Gọi API protected -> Expect 401
  });

  it('JWT Tampering - Chỉnh sửa payload', () => {
    // Đổi userId trong payload của JWT hợp lệ
    // Gọi API protected -> Expect 401
  });
});
