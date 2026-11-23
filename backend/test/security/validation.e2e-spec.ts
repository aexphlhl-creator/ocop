import type { App } from 'supertest/types';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Validation Security (e2e)', () => {
  let app: INestApplication<App>;

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
    if (app) {
      await app.close();
    }
  });

  it('Invalid UUID - ParseUUIDPipe chặn ID không hợp lệ và trả 400 thay vì crash DB', () => {
    return request(app.getHttpServer())
      .get('/api/v1/provinces/not-a-uuid')
      .expect(400);
  });

  it('Mass Assignment - Bị chặn 400 khi gửi thuộc tính không khai báo trong DTO', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'attacker@test.local',
        password: 'Password123!',
        role: 'ADMIN',
        injectedField: 'malicious',
      })
      .expect(400);
  });

  it('SQL Injection Payload - Bị chặn 400 bởi validation format', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: "' OR 1=1 --", password: 'Password123!' })
      .expect(400);
  });
});
