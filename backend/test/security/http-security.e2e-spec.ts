import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import helmet from 'helmet';

describe('HTTP Security (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(helmet());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('Helmet Headers - Trả về các header bảo mật', async () => {
    const response = await request(app.getHttpServer()).get('/health/live');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('CORS - Không cấp header Allow-Origin cho domain lạ không có trong whitelist', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/live')
      .set('Origin', 'http://untrusted-attacker-site.example');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
