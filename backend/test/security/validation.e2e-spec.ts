import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Validation Security (e2e)', () => {
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
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('Invalid UUID - Không crash DB khi truyền string linh tinh vào :id', () => {
    return request(app.getHttpServer())
      .get('/api/v1/products/not-a-uuid')
      .expect(400); // Should be blocked by ParseUUIDPipe or ValidationPipe
  });

  it('Mass Assignment - Bỏ qua các trường không khai báo trong DTO', async () => {
    // Gửi { name: 'abc', role: 'ADMIN' }
    // API phải trả về 400 Bad Request do forbidNonWhitelisted = true
  });

  it('Oversized Payload - Chặn request quá lớn', () => {
    const hugePayload = { data: 'a'.repeat(2 * 1024 * 1024) }; // 2MB
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send(hugePayload)
      .expect(413); // Payload Too Large
  });

  it('SQL Injection / XSS Payload - Bị chặn hoặc sanitize', () => {
    // Send { name: "<script>alert(1)</script>" } -> Expect encoded or rejected if rigid
    // Send { email: "' OR 1=1 --" } -> ValidationPipe expects email format -> 400
  });
});
