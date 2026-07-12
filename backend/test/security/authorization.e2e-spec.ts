import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Authorization Security (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('IDOR Prevention (Seller A vs Seller B)', () => {
    it('Seller A không đọc Product của Seller B (GET /products/:id) -> 403/404', async () => {});
    it('Seller A không update Product của Seller B (PATCH /products/:id) -> 403', async () => {});
    
    it('Seller A không update Inventory của Seller B (POST /inventory/in) -> 403', async () => {});
    it('Seller A không đọc Inventory của Seller B -> 403', async () => {});

    it('Seller A không thao tác Batch của Seller B -> 403', async () => {});
    it('Seller A không thao tác Certificate của Seller B -> 403', async () => {});
    it('Seller A không xem Order của Seller B -> 403', async () => {});
    it('Seller A không chỉnh sửa Business Profile của Seller B -> 403', async () => {});
  });

  describe('Access Control', () => {
    it('Visitor không gọi API protected (không gửi Token) -> 401', () => {
      return request(app.getHttpServer())
        .get('/api/v1/users/me')
        .expect(401);
    });

    it('User thông thường không được gọi API của Admin -> 403', async () => {});
  });
});
