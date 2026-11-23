import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  OrderStatus,
  PaymentAggregateStatus,
  PaymentMethod,
  ProductStatus,
  QualityStatus,
  RoleName,
  ShipmentEventType,
  ShipmentRouteType,
  ShipmentStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { createHmac, randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/features/prisma/prisma.service';
import { RedisService } from '../src/features/redis/redis.service';

describe('OCOP Complete Real E2E Production Lifecycle (HTTP + Postgres + Redis)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const testCarrierSecret = 'test-carrier-secret-that-is-longer-than-32-characters';
  const testRunId = Date.now().toString().slice(-6);

  // Actor credentials & tokens
  const adminCredentials = {
    email: `admin_${testRunId}@ocop.vn`,
    password: 'AdminP@ssw0rd123!',
    fullName: 'Admin Quốc Gia Test',
  };
  const sellerCredentials = {
    email: `seller_${testRunId}@ocop.vn`,
    password: 'SellerP@ssw0rd123!',
    fullName: 'HTX Chè Shan Tuyết Test',
  };
  const qaCredentials = {
    email: `qa_${testRunId}@ocop.vn`,
    password: 'QaP@ssw0rd123!',
    fullName: 'Kiểm Định Viên QA Test',
  };
  const whCredentials = {
    email: `wh_${testRunId}@ocop.vn`,
    password: 'WhP@ssw0rd123!',
    fullName: 'Thủ Kho Test',
  };
  const customerCredentials = {
    email: `customer_${testRunId}@ocop.vn`,
    password: 'CustomerP@ssw0rd123!',
    fullName: 'Khách Hàng Mua Sắm Test',
  };

  let adminToken: string;
  let sellerToken: string;
  let sellerUserId: string;
  let qaToken: string;
  let whToken: string;
  let whUserId: string;
  let customerToken: string;

  // Domain entities
  let categoryId: string;
  let ocopLevelId: string;
  let provinceId: string;
  let wardId: string;
  let productId: string;
  let warehouseId: string;
  let inventoryId: string;
  let batchId: string;
  let orderId: string;
  let shipmentId: string;
  let carrierOrgId: string;
  const trackingCode = `GHN-TRK-${testRunId}`;

  beforeAll(async () => {
    // 1. Initialize NestJS App with full AppModule on real DB and test Redis (db 1)
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    const redisService = app.get<RedisService>(RedisService);
    await redisService.del('categories:list');
    await redisService.del('ocop_levels:list');

    // 2. Ensure initial Admin exists in Database using Argon2id hash (bootstrap)
    const adminRole = await prisma.role.findUniqueOrThrow({
      where: { name: RoleName.ADMIN },
    });
    const hashedPassword = await argon2.hash(adminCredentials.password);
    await prisma.user.create({
      data: {
        email: adminCredentials.email,
        passwordHash: hashedPassword,
        fullName: adminCredentials.fullName,
        roleId: adminRole.id,
        isActive: true,
        mustChangePassword: false,
      },
    });

    // 3. Ensure Province and Ward exist in Database for product creation
    let province = await prisma.province.findFirst();
    if (!province) {
      province = await prisma.province.create({
        data: {
          code: `P_${testRunId}`,
          name: `Hà Giang ${testRunId}`,
          latitude: 22.8233,
          longitude: 104.9839,
        },
      });
    }
    provinceId = province.id;

    let ward = await prisma.ward.findFirst({ where: { provinceId: province.id } });
    if (!ward) {
      ward = await prisma.ward.create({
        data: {
          name: `Vị Xuyên ${testRunId}`,
          provinceId: province.id,
          latitude: 22.8233,
          longitude: 104.9839,
        },
      });
    }
    wardId = ward.id;
  });

  afterAll(async () => {
    try {
      if (prisma && orderId) {
        // Clean up test order dependencies in strict foreign-key dependency order
        await prisma.stockMovement.deleteMany({
          where: { reservation: { orderItem: { orderId } } },
        });
        await prisma.orderItemBatchReservation.deleteMany({
          where: { orderItem: { orderId } },
        });
        await prisma.order.update({
          where: { id: orderId },
          data: { paymentAggregateId: null },
        });
        await prisma.paymentTransaction.deleteMany({
          where: { paymentAggregate: { orders: { some: { id: orderId } } } },
        });
        await prisma.paymentAggregate.deleteMany({
          where: { orders: { some: { id: orderId } } },
        });
        await prisma.shipmentItem.updateMany({
          where: { orderItem: { orderId } },
          data: { orderItemId: null },
        });
        await prisma.orderItem.deleteMany({ where: { orderId } });
      }
    } finally {
      if (app) {
        await app.close();
      }
    }
  });

  it('Step 1: Admin logs in, provisions Seller, QA Operator, WH Manager, verifies Seller via API, and users complete first-login password change', async () => {
    // 1. Admin login via HTTP
    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminCredentials.email, password: adminCredentials.password })
      .expect(200);
    adminToken = adminLoginRes.body.accessToken;
    expect(adminToken).toBeDefined();

    // 2. Admin creates Seller via HTTP API
    const createSellerRes = await request(app.getHttpServer())
      .post('/api/v1/users/sellers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: sellerCredentials.email,
        password: sellerCredentials.password,
        fullName: sellerCredentials.fullName,
      })
      .expect(201);
    sellerUserId = createSellerRes.body.id;
    const sellerProfileId = createSellerRes.body.sellerProfile?.id;
    expect(sellerProfileId).toBeDefined();

    // Admin verifies Seller profile via official HTTP API (NO DB SHORTCUT)
    await request(app.getHttpServer())
      .patch(`/api/v1/seller-profiles/${sellerProfileId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isVerified: true })
      .expect(200);

    // 3. Admin creates QA Operator via HTTP API
    await request(app.getHttpServer())
      .post('/api/v1/users/quality-assurance')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: qaCredentials.email,
        password: qaCredentials.password,
        fullName: qaCredentials.fullName,
      })
      .expect(201);

    // 4. Admin creates Warehouse Manager via HTTP API
    const createWhRes = await request(app.getHttpServer())
      .post('/api/v1/users/warehouse-managers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: whCredentials.email,
        password: whCredentials.password,
        fullName: whCredentials.fullName,
      })
      .expect(201);
    whUserId = createWhRes.body.id;

    // 5. Official first-login password change via PATCH /api/v1/auth/change-password (NO DB SHORTCUT)
    // Seller:
    const sellerInitLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: sellerCredentials.email, password: sellerCredentials.password })
      .expect(200);
    expect(sellerInitLogin.body.user.mustChangePassword).toBe(true);
    const sellerTempToken = sellerInitLogin.body.accessToken;

    const sellerNewPassword = `${sellerCredentials.password}Perm!`;
    await request(app.getHttpServer())
      .patch('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${sellerTempToken}`)
      .send({
        currentPassword: sellerCredentials.password,
        newPassword: sellerNewPassword,
      })
      .expect(200);

    const sellerLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: sellerCredentials.email, password: sellerNewPassword })
      .expect(200);
    expect(sellerLoginRes.body.user.mustChangePassword).toBe(false);
    sellerToken = sellerLoginRes.body.accessToken;

    // QA:
    const qaInitLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: qaCredentials.email, password: qaCredentials.password })
      .expect(200);
    const qaTempToken = qaInitLogin.body.accessToken;

    const qaNewPassword = `${qaCredentials.password}Perm!`;
    await request(app.getHttpServer())
      .patch('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${qaTempToken}`)
      .send({
        currentPassword: qaCredentials.password,
        newPassword: qaNewPassword,
      })
      .expect(200);

    const qaLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: qaCredentials.email, password: qaNewPassword })
      .expect(200);
    qaToken = qaLoginRes.body.accessToken;

    // Warehouse Manager:
    const whInitLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: whCredentials.email, password: whCredentials.password })
      .expect(200);
    const whTempToken = whInitLogin.body.accessToken;

    const whNewPassword = `${whCredentials.password}Perm!`;
    await request(app.getHttpServer())
      .patch('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${whTempToken}`)
      .send({
        currentPassword: whCredentials.password,
        newPassword: whNewPassword,
      })
      .expect(200);

    const whLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: whCredentials.email, password: whNewPassword })
      .expect(200);
    whToken = whLoginRes.body.accessToken;

    // 6. Customer registers via public HTTP API (NO DB SHORTCUT)
    const custRegRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: customerCredentials.email,
        password: customerCredentials.password,
        fullName: customerCredentials.fullName,
      })
      .expect(201);
    customerToken = custRegRes.body.accessToken;
    expect(customerToken).toBeDefined();
  });

  it('Step 2: Product Creation via Independent Category & OCOP Level APIs', async () => {
    // 1. Fetch categories independently
    const categoriesRes = await request(app.getHttpServer())
      .get('/api/v1/categories')
      .expect(200);
    expect(Array.isArray(categoriesRes.body)).toBe(true);
    expect(categoriesRes.body.length).toBeGreaterThanOrEqual(5);
    categoryId = categoriesRes.body[0].id;

    // 2. Fetch OCOP star levels independently
    const levelsRes = await request(app.getHttpServer())
      .get('/api/v1/ocop-levels')
      .expect(200);
    expect(Array.isArray(levelsRes.body)).toBe(true);
    expect(levelsRes.body.length).toBeGreaterThanOrEqual(3);
    ocopLevelId = levelsRes.body[0].id;

    // 3. Seller creates product using independent category and star rating
    const createProductRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        name: `Trà Shan Tuyết Cổ Thụ Hà Giang ${testRunId}`,
        description: 'Trà búp cổ thụ đặc sản OCOP 4 sao',
        price: 150000,
        unit: 'Hộp 200g',
        categoryId,
        ocopLevelId,
        provinceId,
        wardId,
        latitude: 22.8233,
        longitude: 104.9839,
      })
      .expect(201);

    productId = createProductRes.body.id;
    expect(productId).toBeDefined();

    // Verify in PostgreSQL database: initial status is PENDING
    const productInDb = await prisma.product.findUnique({ where: { id: productId } });
    expect(productInDb?.status).toBe(ProductStatus.PENDING);
  });

  it('Step 3: RBAC 403 Check (Seller cannot approve product, only Admin)', async () => {
    // Seller attempts to approve their own product -> Expect 403 Forbidden!
    await request(app.getHttpServer())
      .patch(`/api/v1/products/${productId}/approve`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: ProductStatus.APPROVED })
      .expect(403);

    // Admin approves product -> Expect 200 OK
    await request(app.getHttpServer())
      .patch(`/api/v1/products/${productId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: ProductStatus.APPROVED })
      .expect(200);

    // Verify status in PostgreSQL
    const approvedProduct = await prisma.product.findUnique({ where: { id: productId } });
    expect(approvedProduct?.status).toBe(ProductStatus.APPROVED);
  });

  it('Step 4: Provision Warehouse, Inventory, declare Lot (100 units), Master Data & Journeys via HTTP APIs', async () => {
    // 1. Admin creates warehouse assigned to Seller and Warehouse Manager
    const whRes = await request(app.getHttpServer())
      .post('/api/v1/inventory/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sellerId: sellerUserId,
        managerId: whUserId,
        name: `Kho Trà Vị Xuyên ${testRunId}`,
        address: 'Thị trấn Vị Xuyên, Hà Giang',
      })
      .expect(201);
    warehouseId = whRes.body.id;

    // 2. Seller creates inventory linking product and warehouse
    const invRes = await request(app.getHttpServer())
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        warehouseId,
        productId,
        minimumQuantity: 5,
      })
      .expect(201);
    inventoryId = invRes.body.id;

    // 3. Seller declares a production lot of 100 units
    const batchRes = await request(app.getHttpServer())
      .post('/api/v1/supply-chain/batches')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        idempotencyKey: `idemp-lot-${testRunId}`,
        inventoryId,
        batchNumber: `LOT-SHAN-${testRunId}`,
        declaredQuantity: 100,
        harvestDate: new Date().toISOString(),
        expiryDate: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      })
      .expect(201);
    batchId = batchRes.body.id;

    // 3b. Create Traceability Party & Location & Origin Declaration via HTTP APIs (NO DB SHORTCUT)
    const partyRes = await request(app.getHttpServer())
      .post('/api/v1/supply-chain/traceability/parties')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        code: `PTY_${testRunId}`,
        name: `HTX Shan Tuyết ${testRunId}`,
        type: 'PRODUCER',
        taxCode: `010${testRunId}`,
      })
      .expect(201);
    const partyId = partyRes.body.id;

    const locRes = await request(app.getHttpServer())
      .post(`/api/v1/supply-chain/traceability/parties/${partyId}/locations`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        code: `LOC_${testRunId}`,
        name: `Vườn chè cổ thụ ${testRunId}`,
        type: 'FARM',
        address: 'Xã Cao Bồ, Vị Xuyên, Hà Giang',
        latitude: 22.8233,
        longitude: 104.9839,
      })
      .expect(201);
    const locationId = locRes.body.id;

    // Admin verifies the traceability party via HTTP API
    await request(app.getHttpServer())
      .post(`/api/v1/supply-chain/traceability/parties/${partyId}/verification`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ verified: true })
      .expect(201);

    // Seller declares batch origin via HTTP API
    await request(app.getHttpServer())
      .post(`/api/v1/supply-chain/batch/${batchId}/origin`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        partyId,
        locationId,
        sourceLotCode: `SRC_${testRunId}`,
        countryCode: 'VN',
        harvestDate: new Date().toISOString(),
        productionMethod: 'Thu hoạch búp chè tuyết cổ thụ hữu cơ',
        evidenceUrls: ['https://example.com/harvest-proof.jpg'],
      })
      .expect(201);

    // 3c. Seller records required production journeys via official HTTP API in sequence (NO DB SHORTCUT)
    const harvestStage = await prisma.supplyChainStage.findFirstOrThrow({ where: { name: 'HARVEST' } });
    const processingStage = await prisma.supplyChainStage.findFirstOrThrow({ where: { name: 'PROCESSING' } });
    const packagingStage = await prisma.supplyChainStage.findFirstOrThrow({ where: { name: 'PACKAGING' } });

    const now = Date.now();

    await request(app.getHttpServer())
      .post(`/api/v1/supply-chain/batch/${batchId}/journey`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        stageId: harvestStage.id,
        location: 'Vườn chè Cao Bồ, Vị Xuyên, Hà Giang',
        actorName: sellerCredentials.fullName,
        eventTime: new Date(now - 30000).toISOString(),
        note: 'Thu hái búp chè sáng sớm khi sương đọng',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/supply-chain/batch/${batchId}/journey`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        stageId: processingStage.id,
        location: 'Xưởng sao chè Cao Bồ, Vị Xuyên',
        actorName: sellerCredentials.fullName,
        eventTime: new Date(now - 20000).toISOString(),
        note: 'Diệt men, vò lá và sấy củi chè Shan Tuyết',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/supply-chain/batch/${batchId}/journey`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        stageId: packagingStage.id,
        location: 'Xưởng đóng gói Vị Xuyên',
        actorName: sellerCredentials.fullName,
        eventTime: new Date(now - 10000).toISOString(),
        note: 'Hút chân không hộp thiếc 200g dán tem QR OCOP',
      })
      .expect(201);

    // 4. Seller submits lot for inspection via HTTP API
    const subRes = await request(app.getHttpServer())
      .post(`/api/v1/supply-chain/batch/${batchId}/submit`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        idempotencyKey: `idemp-sub-${testRunId}`,
      });
    if (subRes.status !== 201) {
      console.error('SUBMIT FAILED:', subRes.status, subRes.body);
    }
    expect(subRes.status).toBe(201);

    const batchInDb = await prisma.inventoryBatch.findUnique({ where: { id: batchId } });
    expect(batchInDb?.lifecycleStatus).toBe('SUBMITTED');
  });

  it('Step 5: RBAC 403 Check (Seller cannot QA inspect) & QA passes lot & Warehouse releases it', async () => {
    // 1. Warehouse Manager receives lot into inventory (quarantine)
    await request(app.getHttpServer())
      .post(`/api/v1/supply-chain/batch/${batchId}/receive`)
      .set('Authorization', `Bearer ${whToken}`)
      .send({
        idempotencyKey: `idemp-wh-rcv-${testRunId}`,
        receivedQuantity: 100,
        referenceCode: `BB-RCV-${testRunId}`,
        location: 'Kho Trà Vị Xuyên',
        imageUrls: ['https://example.com/receipt.jpg'],
      })
      .expect(201);

    // 2. Seller attempts QA inspection -> Expect 403 Forbidden!
    await request(app.getHttpServer())
      .post(`/api/v1/supply-chain/batch/${batchId}/inspect`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        idempotencyKey: `idemp-seller-fail-${testRunId}`,
        qualityStatus: QualityStatus.PASSED,
        note: 'Đạt tiêu chuẩn xuất khẩu',
        referenceCode: `BB-QC-${testRunId}`,
        location: 'Phòng kiểm định chất lượng Vị Xuyên',
        imageUrls: ['https://example.com/qc.jpg'],
      })
      .expect(403);

    // 3. QA Operator inspects and passes the lot -> Expect 201 Created
    await request(app.getHttpServer())
      .post(`/api/v1/supply-chain/batch/${batchId}/inspect`)
      .set('Authorization', `Bearer ${qaToken}`)
      .send({
        idempotencyKey: `idemp-qa-pass-${testRunId}`,
        qualityStatus: QualityStatus.PASSED,
        note: 'Đạt tiêu chuẩn xuất khẩu',
        referenceCode: `BB-QC-${testRunId}`,
        location: 'Phòng kiểm định chất lượng Vị Xuyên',
        imageUrls: ['https://example.com/qc.jpg'],
      })
      .expect(201);

    // 4. Warehouse Manager puts away lot into storage location
    await request(app.getHttpServer())
      .post(`/api/v1/supply-chain/batch/${batchId}/put-away`)
      .set('Authorization', `Bearer ${whToken}`)
      .send({
        idempotencyKey: `idemp-wh-put-${testRunId}`,
        warehouseLocation: 'Kệ A1-02',
        location: 'Kho Trà Vị Xuyên',
      })
      .expect(201);

    // 5. QA Operator releases batch for commercial distribution
    await request(app.getHttpServer())
      .post(`/api/v1/supply-chain/batch/${batchId}/release`)
      .set('Authorization', `Bearer ${qaToken}`)
      .send({
        idempotencyKey: `idemp-qa-rel-${testRunId}`,
        note: 'Cho phép xuất kho thương mại',
        referenceCode: `QD-REL-${testRunId}`,
      })
      .expect(201);

    // Verify in PostgreSQL: batch is RELEASED and PASSED
    const releasedBatch = await prisma.inventoryBatch.findUnique({ where: { id: batchId } });
    expect(releasedBatch?.qualityStatus).toBe(QualityStatus.PASSED);
    expect(releasedBatch?.lifecycleStatus).toBe('RELEASED');
    expect(releasedBatch?.quantity).toBe(100);
  });

  it('Step 6: Available Stock Check (Exactly 100 units from RELEASED & PASSED lot)', async () => {
    const productDetailRes = await request(app.getHttpServer())
      .get(`/api/v1/products/${productId}`)
      .expect(200);

    expect(productDetailRes.body.availableStock).toBe(100);
  });

  it('Step 7: Customer checkouts 5 units via COD & Available Stock drops from 100 to 95', async () => {
    // Customer checkouts 5 units via COD
    const checkoutRes = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        idempotencyKey: randomUUID(),
        shippingAddress: '123 Đường Trần Phú, Ba Đình, Hà Nội',
        phone: '0987654321',
        paymentMethod: PaymentMethod.COD,
        items: [{ productId, quantity: 5 }],
      })
      .expect(201);

    orderId = checkoutRes.body.orders?.[0]?.id || checkoutRes.body.orderId || checkoutRes.body.id;
    expect(orderId).toBeDefined();

    // Verify in PostgreSQL: active reservation created for 5 units
    const reservation = await prisma.orderItemBatchReservation.findFirst({
      where: { batchId, status: 'ACTIVE' },
    });
    expect(reservation).toBeDefined();
    expect(reservation?.quantity).toBe(5);

    // CRITICAL: Verify Available Stock strictly decreased from 100 -> 95
    const stockAfterCheckoutRes = await request(app.getHttpServer())
      .get(`/api/v1/products/${productId}`)
      .expect(200);

    expect(stockAfterCheckoutRes.body.availableStock).toBe(95);
  });

  it('Step 8: Warehouse packs and creates Shipment in HANDED_OVER status', async () => {
    // 1a. Seller confirms order (PENDING -> CONFIRMED)
    await request(app.getHttpServer())
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: OrderStatus.CONFIRMED })
      .expect(200);

    // 1b. Seller starts packing order (CONFIRMED -> PACKING)
    await request(app.getHttpServer())
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: OrderStatus.PACKING })
      .expect(200);

    // 2. Create Logistics Organization (Carrier) in DB
    const carrier = await prisma.logisticsOrganization.upsert({
      where: { code: 'GHN' },
      update: {},
      create: {
        code: 'GHN',
        name: 'Giao Hàng Nhanh Test',
        isActive: true,
      },
    });
    carrierOrgId = carrier.id;

    // 3. Get order item ID
    const orderItem = await prisma.orderItem.findFirstOrThrow({
      where: { orderId },
    });

    // 4. Warehouse Manager creates shipment
    const createShipmentRes = await request(app.getHttpServer())
      .post('/api/v1/shipments')
      .set('Authorization', `Bearer ${whToken}`)
      .send({
        idempotencyKey: `idemp-ship-${testRunId}`,
        originWarehouseId: warehouseId,
        carrierOrganizationId: carrierOrgId,
        routeType: ShipmentRouteType.DIRECT_TO_CUSTOMER,
        orderId,
        trackingCode,
        destinationName: customerCredentials.fullName,
        destinationAddress: '123 Đường Trần Phú, Ba Đình, Hà Nội',
        destinationPhone: '0987654321',
        items: [
          {
            batchId,
            orderItemId: orderItem.id,
            quantity: 5,
          },
        ],
      })
      .expect(201);

    shipmentId = createShipmentRes.body.id;
    expect(shipmentId).toBeDefined();

    // Warehouse Manager hands over shipment
    await request(app.getHttpServer())
      .post(`/api/v1/shipments/${shipmentId}/handover`)
      .set('Authorization', `Bearer ${whToken}`)
      .send({
        expectedVersion: 0,
        idempotencyKey: `idemp-hnd-${testRunId}`,
        location: 'Kho Trà Vị Xuyên',
        imageUrls: ['https://example.com/handover.jpg'],
      })
      .expect(201);

    // Verify in PostgreSQL: shipment status is HANDED_OVER
    const shipmentInDb = await prisma.shipment.findUnique({ where: { id: shipmentId } });
    expect(shipmentInDb?.status).toBe(ShipmentStatus.HANDED_OVER);
  });

  it('Step 9: Carrier Webhook with Tampered Signature is Rejected (401 Unauthorized)', async () => {
    const payload = {
      externalEventId: `evt-picked-${testRunId}`,
      trackingCode,
      eventType: ShipmentEventType.PICKED_UP,
      eventTime: new Date().toISOString(),
      location: 'Bưu cục GHN Vị Xuyên',
    };

    // Send webhook with invalid signature -> Expect 401 Unauthorized!
    await request(app.getHttpServer())
      .post('/api/v1/shipments/webhooks/GHN')
      .set('x-carrier-signature', 'sha256=invalid_tampered_signature_that_fails_hmac')
      .send(payload)
      .expect(401);

    // Verify in PostgreSQL: shipment status was NOT changed
    const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
    expect(shipment?.status).toBe(ShipmentStatus.HANDED_OVER);
  });

  it('Step 10: Valid Carrier Webhook (PICKED_UP -> IN_TRANSIT)', async () => {
    const payload = {
      externalEventId: `evt-picked-valid-${testRunId}`,
      trackingCode,
      eventType: ShipmentEventType.PICKED_UP,
      eventTime: new Date().toISOString(),
      location: 'Bưu cục GHN Vị Xuyên',
    };

    const rawJson = JSON.stringify(payload);
    const validHmac = createHmac('sha256', testCarrierSecret).update(rawJson).digest('hex');

    // Send webhook with valid HMAC signature -> Expect 200 or 201
    const res = await request(app.getHttpServer())
      .post('/api/v1/shipments/webhooks/GHN')
      .set('Content-Type', 'application/json')
      .set('x-carrier-signature', `sha256=${validHmac}`)
      .send(rawJson);

    expect([200, 201]).toContain(res.status);

    // Verify in PostgreSQL: shipment status transitioned to IN_TRANSIT
    const updatedShipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
    expect(updatedShipment?.status).toBe(ShipmentStatus.IN_TRANSIT);
  });

  it('Step 11: Valid Carrier Webhooks (OUT_FOR_DELIVERY -> DELIVERED) complete Order and settle COD payment in DB', async () => {
    const baseTime = Date.now();

    // 1. Carrier emits OUT_FOR_DELIVERY (IN_TRANSIT -> OUT_FOR_DELIVERY)
    const outPayload = {
      externalEventId: `evt-out-valid-${testRunId}`,
      trackingCode,
      eventType: ShipmentEventType.OUT_FOR_DELIVERY,
      eventTime: new Date(baseTime + 1000).toISOString(),
      location: 'Bưu tá đang phát tại 123 Đường Trần Phú',
    };
    const outRawJson = JSON.stringify(outPayload);
    const outHmac = createHmac('sha256', testCarrierSecret).update(outRawJson).digest('hex');

    const outRes = await request(app.getHttpServer())
      .post('/api/v1/shipments/webhooks/GHN')
      .set('Content-Type', 'application/json')
      .set('x-carrier-signature', `sha256=${outHmac}`)
      .send(outRawJson);

    expect([200, 201]).toContain(outRes.status);

    // 2. Carrier emits DELIVERED (OUT_FOR_DELIVERY -> DELIVERED)
    const deliveredPayload = {
      externalEventId: `evt-delivered-valid-${testRunId}`,
      trackingCode,
      eventType: ShipmentEventType.DELIVERED,
      eventTime: new Date(baseTime + 2000).toISOString(),
      location: 'Đã giao thành công tại 123 Đường Trần Phú',
      recipientName: customerCredentials.fullName,
    };

    const deliveredRawJson = JSON.stringify(deliveredPayload);
    const deliveredHmac = createHmac('sha256', testCarrierSecret).update(deliveredRawJson).digest('hex');

    const deliveredRes = await request(app.getHttpServer())
      .post('/api/v1/shipments/webhooks/GHN')
      .set('Content-Type', 'application/json')
      .set('x-carrier-signature', `sha256=${deliveredHmac}`)
      .send(deliveredRawJson);

    expect([200, 201]).toContain(deliveredRes.status);

    // 3. Verify in PostgreSQL: shipment is DELIVERED
    const finalShipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
    expect(finalShipment?.status).toBe(ShipmentStatus.DELIVERED);

    // 4. Verify in PostgreSQL: order is DELIVERED
    const finalOrder = await prisma.order.findUnique({ where: { id: orderId } });
    expect(finalOrder?.status).toBe(OrderStatus.DELIVERED);

    // 5. Verify in PostgreSQL: COD payment is settled and marked COMPLETED
    const paymentAggregate = await prisma.paymentAggregate.findFirst({
      where: { orders: { some: { id: orderId } } },
    });
    expect(paymentAggregate?.status).toBe(PaymentAggregateStatus.COMPLETED);
  });
});
