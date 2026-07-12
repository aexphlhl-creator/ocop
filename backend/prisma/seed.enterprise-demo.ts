import 'dotenv/config';
import {
  BatchStatus,
  CertificateStatus,
  DeliveryStatus,
  EventStatus,
  MovementType,
  NotificationTarget,
  POStatus,
  PrismaClient,
  ProductStatus,
  QualityStatus,
  QualityStatusEnum,
  RoleName,
  SupplierType,
  SupplyChainStageName,
  WarehouseType,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const now = new Date();
const addDays = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
const subDays = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

async function seedRoles() {
  const roles = [
    [RoleName.ADMIN, 'System administrator'],
    [RoleName.SELLER, 'OCOP seller and warehouse operator'],
    [RoleName.VISITOR, 'Customer and public visitor'],
    [RoleName.EVENT_COORDINATOR, 'Event coordinator'],
  ] as const;

  const map = new Map<RoleName, Awaited<ReturnType<typeof prisma.role.upsert>>>();
  for (const [name, description] of roles) {
    const role = await prisma.role.upsert({
      where: { name },
      update: { description },
      create: { name, description },
    });
    map.set(name, role);
  }
  return map;
}

async function seedUsers(roles: Map<RoleName, { id: string }>) {
  const passwordHash = bcrypt.hashSync('demo123', 10);
  const users = [
    ['admin.enterprise@demo.com', 'Nguyen Minh Anh - Demo Admin', RoleName.ADMIN, '0901000001'],
    ['seller.enterprise@demo.com', 'Tran Quoc Viet - Demo Seller', RoleName.SELLER, '0901000002'],
    ['customer.enterprise@demo.com', 'Le Thu Ha - Demo Customer', RoleName.VISITOR, '0901000003'],
    ['event.enterprise@demo.com', 'Pham Ngoc Lan - Event Coordinator', RoleName.EVENT_COORDINATOR, '0901000004'],
    ['warehouse.enterprise@demo.com', 'Hoang Duc Long - Warehouse Manager', RoleName.SELLER, '0901000005'],
  ] as const;

  const map = new Map<string, Awaited<ReturnType<typeof prisma.user.upsert>>>();
  for (const [email, fullName, roleName, phone] of users) {
    const role = roles.get(roleName);
    if (!role) throw new Error(`Missing role ${roleName}`);

    const user = await prisma.user.upsert({
      where: { email },
      update: { fullName, phone, roleId: role.id, isActive: true },
      create: { email, fullName, phone, passwordHash, roleId: role.id, isActive: true },
    });
    map.set(email, user);
  }
  return map;
}

async function seedLookups() {
  const categories = [
    ['Food', 'food', 'Packaged OCOP food, tea, coffee, fish sauce, honey and processed specialties'],
    ['Agriculture', 'agriculture', 'Fresh and semi-processed agricultural products from Vietnamese regions'],
    ['Handicraft', 'handicraft', 'Traditional craft products, bamboo, ceramic, textile and lacquer goods'],
  ] as const;

  const categoryMap = new Map<string, Awaited<ReturnType<typeof prisma.category.upsert>>>();
  for (const [name, slug, description] of categories) {
    categoryMap.set(
      slug,
      await prisma.category.upsert({
        where: { slug },
        update: { name, description },
        create: { name, slug, description },
      }),
    );
  }

  const ocopMap = new Map<number, Awaited<ReturnType<typeof prisma.ocopLevel.upsert>>>();
  for (const level of [3, 4, 5]) {
    ocopMap.set(
      level,
      await prisma.ocopLevel.upsert({
        where: { level },
        update: { title: `${level} Stars OCOP`, icon: `star-${level}` },
        create: { level, title: `${level} Stars OCOP`, icon: `star-${level}` },
      }),
    );
  }

  const stageData = [
    [SupplyChainStageName.HARVEST, 'Harvest', 'Sprout', '#16A34A', 1],
    [SupplyChainStageName.PROCESSING, 'Processing', 'Factory', '#D97706', 4],
    [SupplyChainStageName.PACKAGING, 'Packaging', 'Box', '#0891B2', 5],
    [SupplyChainStageName.QUALITY_INSPECTION, 'Quality Check', 'FlaskConical', '#7C3AED', 3],
    [SupplyChainStageName.SHIPPING, 'Shipping', 'Truck', '#DC2626', 7],
    [SupplyChainStageName.CUSTOMER, 'Delivered', 'UserCheck', '#0D9488', 10],
  ] as const;
  const stageMap = new Map<SupplyChainStageName, Awaited<ReturnType<typeof prisma.supplyChainStage.upsert>>>();
  for (const [name, displayName, icon, color, order] of stageData) {
    stageMap.set(
      name,
      await prisma.supplyChainStage.upsert({
        where: { name },
        update: { displayName, icon, color, order, description: `${displayName} milestone for demo traceability` },
        create: { name, displayName, icon, color, order, description: `${displayName} milestone for demo traceability` },
      }),
    );
  }

  const certMap = new Map<string, Awaited<ReturnType<typeof prisma.certificateType.upsert>>>();
  for (const [code, name] of [
    ['OCOP', 'OCOP'],
    ['VIETGAP', 'VietGAP'],
    ['HACCP', 'HACCP'],
  ] as const) {
    certMap.set(
      code,
      await prisma.certificateType.upsert({
        where: { code },
        update: { name, description: `${name} enterprise demo certificate` },
        create: { code, name, description: `${name} enterprise demo certificate` },
      }),
    );
  }

  return { categoryMap, ocopMap, stageMap, certMap };
}

async function seedLocations() {
  const provinces = [
    ['Hanoi Demo', 'D-HN', 21.0278, 105.8342],
    ['Lam Dong Demo', 'D-LD', 11.9404, 108.4583],
    ['Can Tho Demo', 'D-CT', 10.0452, 105.7469],
    ['Quang Ninh Demo', 'D-QN', 20.9712, 107.0448],
    ['Ben Tre Demo', 'D-BT', 10.2434, 106.3756],
  ] as const;

  const result = [];
  for (const [name, code, latitude, longitude] of provinces) {
    const province = await prisma.province.upsert({
      where: { code },
      update: { name, latitude, longitude },
      create: { name, code, latitude, longitude },
    });
    const ward = await prisma.ward.upsert({
      where: { provinceId_name: { provinceId: province.id, name: `${name} OCOP Ward` } },
      update: { latitude, longitude, description: `Enterprise demo ward for ${name}` },
      create: {
        name: `${name} OCOP Ward`,
        provinceId: province.id,
        latitude,
        longitude,
        description: `Enterprise demo ward for ${name}`,
      },
    });
    result.push({ province, ward });
  }
  return result;
}

async function seedBusinesses(locations: Awaited<ReturnType<typeof seedLocations>>, sellerId: string) {
  const businessData = [
    ['D-BIZ-001', 'Bao Minh Tea Cooperative', 'Premium tea and herbal drinks', 0],
    ['D-BIZ-002', 'Da Lat Highland Agriculture', 'Fresh fruit and dried vegetable processing', 1],
    ['D-BIZ-003', 'Mekong Honey Farm', 'Honey, coconut and tropical agriculture', 2],
    ['D-BIZ-004', 'Ha Long Seafood Craft', 'Dried seafood and regional specialties', 3],
    ['D-BIZ-005', 'Ben Tre Bamboo Workshop', 'Bamboo and coconut handicraft products', 4],
  ] as const;

  const businesses = [];
  for (const [taxCode, name, industry, locationIndex] of businessData) {
    const { province, ward } = locations[locationIndex];
    businesses.push(
      await prisma.business.upsert({
        where: { taxCode },
        update: {
          name,
          industry,
          isVerified: true,
          userId: sellerId,
          wardId: ward.id,
          provinceId: province.id,
        },
        create: {
          name,
          taxCode,
          phone: `0902${locationIndex}0000`,
          email: `contact+${taxCode.toLowerCase()}@demo.ocop.vn`,
          address: `${12 + locationIndex} Demo OCOP Road, ${province.name}`,
          description: `${name} is a verified OCOP enterprise prepared for customer demonstrations.`,
          industry,
          userId: sellerId,
          wardId: ward.id,
          provinceId: province.id,
          isVerified: true,
        },
      }),
    );
  }
  return businesses;
}

async function seedProducts(
  businesses: Awaited<ReturnType<typeof seedBusinesses>>,
  lookups: Awaited<ReturnType<typeof seedLookups>>,
  adminId: string,
) {
  const productNames = [
    ['Shan Tuyet Premium Tea', 'food', 5, 285000, 'box'],
    ['Da Lat Dried Persimmon', 'agriculture', 4, 165000, 'pack'],
    ['Mekong Longan Honey', 'food', 4, 220000, 'bottle'],
    ['Ha Long Dried Squid', 'food', 5, 450000, 'pack'],
    ['Ben Tre Bamboo Basket', 'handicraft', 3, 180000, 'piece'],
    ['Arabica Cau Dat Coffee', 'food', 5, 320000, 'bag'],
    ['Organic Red Dragon Fruit', 'agriculture', 4, 95000, 'kg'],
    ['Coconut Candy Gift Box', 'food', 4, 135000, 'box'],
    ['Handwoven Brocade Scarf', 'handicraft', 3, 260000, 'piece'],
    ['Lotus Seed Snack', 'food', 3, 85000, 'pack'],
    ['Macadamia Kernel Jar', 'agriculture', 4, 240000, 'jar'],
    ['Fish Sauce Heritage 40N', 'food', 5, 190000, 'bottle'],
    ['Herbal Bath Sachet', 'agriculture', 3, 78000, 'pack'],
    ['Lacquer Serving Tray', 'handicraft', 4, 390000, 'piece'],
    ['Cinnamon Essential Oil', 'agriculture', 4, 155000, 'bottle'],
    ['Rice Cracker Sesame', 'food', 3, 65000, 'pack'],
    ['Lotus Tea Tin', 'food', 5, 310000, 'tin'],
    ['Coconut Fiber Planter', 'handicraft', 3, 125000, 'piece'],
    ['Freeze Dried Mango', 'agriculture', 4, 145000, 'pack'],
    ['Ceramic Tea Set', 'handicraft', 5, 680000, 'set'],
  ] as const;

  const products = [];
  for (let i = 0; i < productNames.length; i++) {
    const [name, categorySlug, level, price, unit] = productNames[i];
    const business = businesses[i % businesses.length];
    const category = lookups.categoryMap.get(categorySlug);
    const ocopLevel = lookups.ocopMap.get(level);
    if (!category || !ocopLevel) throw new Error(`Missing lookup for ${name}`);

    const product = await prisma.product.upsert({
      where: { slug: `demo-${slugify(name)}` },
      update: {
        name,
        price,
        unit,
        status: ProductStatus.APPROVED,
        approvedAt: subDays(20 - (i % 10)),
        approvedById: adminId,
      },
      create: {
        name,
        slug: `demo-${slugify(name)}`,
        description: `${name} is part of the enterprise OCOP demo catalog with traceability, inventory and certificates.`,
        price,
        unit,
        ocopLevelId: ocopLevel.id,
        categoryId: category.id,
        businessId: business.id,
        wardId: business.wardId,
        provinceId: business.provinceId,
        latitude: 10.7 + i * 0.28,
        longitude: 105.2 + i * 0.13,
        status: ProductStatus.APPROVED,
        approvedAt: subDays(20 - (i % 10)),
        approvedById: adminId,
        originProcess: 'Raw materials sourced from registered Vietnamese OCOP production zones.',
        farmingProcess: 'Supplier farms follow controlled input, irrigation and quality assurance logs.',
        harvestProcess: 'Harvest lots are recorded by date, area and responsible operator.',
        packagingProcess: 'Finished goods are packed with QR traceability labels and batch codes.',
        certificateNumber: `DEMO-OCOP-${String(i + 1).padStart(3, '0')}`,
        harvestDate: subDays(35 + i),
      },
    });

    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    await prisma.productImage.create({
      data: {
        productId: product.id,
        imageUrl: `/images/demo/ocop-product-${(i % 8) + 1}.jpg`,
        isPrimary: true,
      },
    });

    products.push(product);
  }
  return products;
}

async function seedWarehouses(businesses: Awaited<ReturnType<typeof seedBusinesses>>, managerId: string) {
  const warehouseData = [
    ['D-WH-HN-01', 'Hanoi Northern Distribution Center', 'No. 88 Vo Chi Cong, Tay Ho, Hanoi', 21.0763, 105.8181, WarehouseType.DISTRIBUTION_CENTER, 0],
    ['D-WH-LD-01', 'Da Lat Cold Storage Hub', 'No. 15 Hung Vuong, Da Lat, Lam Dong', 11.9465, 108.4419, WarehouseType.COLD_STORAGE, 1],
    ['D-WH-CT-01', 'Can Tho Mekong Fulfillment Warehouse', 'No. 22 Nguyen Van Cu, Can Tho', 10.0452, 105.7469, WarehouseType.FINISHED_GOODS, 2],
  ] as const;

  const warehouses = [];
  for (const [code, name, address, latitude, longitude, type, businessIndex] of warehouseData) {
    const business = businesses[businessIndex];
    warehouses.push(
      await prisma.warehouse.upsert({
        where: { code },
        update: {
          name,
          address,
          latitude,
          longitude,
          type,
          businessId: business.id,
          managerId,
          isActive: true,
        },
        create: {
          code,
          name,
          address,
          formattedAddress: address,
          latitude,
          longitude,
          type,
          businessId: business.id,
          managerId,
          isActive: true,
          description: `${name} serves the enterprise OCOP demo inventory flow.`,
        },
      }),
    );
  }
  return warehouses;
}

async function seedInventory(products: Awaited<ReturnType<typeof seedProducts>>, warehouses: Awaited<ReturnType<typeof seedWarehouses>>, actorId: string) {
  const seededBatches = [];

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const warehouse = warehouses[i % warehouses.length];
    const firstQty = 80 + i * 3;
    const secondQty = 120 + i * 4;
    const total = firstQty + secondQty;

    const inventory = await prisma.inventory.upsert({
      where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } },
      update: { currentQuantity: total, reservedQuantity: i % 4, minimumQuantity: 25 },
      create: {
        warehouseId: warehouse.id,
        productId: product.id,
        currentQuantity: total,
        reservedQuantity: i % 4,
        minimumQuantity: 25,
      },
    });

    await prisma.stockMovement.deleteMany({ where: { inventoryId: inventory.id, referenceType: 'DEMO_SEED' } });

    for (let batchIndex = 0; batchIndex < 2; batchIndex++) {
      const quantity = batchIndex === 0 ? firstQty : secondQty;
      const batchNumber = `DEMO-${String(i + 1).padStart(3, '0')}-${batchIndex === 0 ? 'FIFO-A' : 'FIFO-B'}`;
      const existing = await prisma.inventoryBatch.findFirst({ where: { inventoryId: inventory.id, batchNumber } });
      const batch = existing
        ? await prisma.inventoryBatch.update({
            where: { id: existing.id },
            data: {
              quantity,
              initialQuantity: quantity,
              manufactureDate: subDays(45 - batchIndex * 10),
              harvestDate: subDays(55 - batchIndex * 10),
              expiryDate: addDays(120 + batchIndex * 60 + i),
              receivedDate: subDays(35 - batchIndex * 7),
              supplier: `Demo Supplier ${(i % 5) + 1}`,
              warehouseLocation: batchIndex === 0 ? 'FIFO Rack A' : 'FIFO Rack B',
              status: BatchStatus.ACTIVE,
              qualityStatus: QualityStatus.PASSED,
            },
          })
        : await prisma.inventoryBatch.create({
            data: {
              inventoryId: inventory.id,
              batchNumber,
              quantity,
              initialQuantity: quantity,
              manufactureDate: subDays(45 - batchIndex * 10),
              harvestDate: subDays(55 - batchIndex * 10),
              expiryDate: addDays(120 + batchIndex * 60 + i),
              receivedDate: subDays(35 - batchIndex * 7),
              supplier: `Demo Supplier ${(i % 5) + 1}`,
              warehouseLocation: batchIndex === 0 ? 'FIFO Rack A' : 'FIFO Rack B',
              status: BatchStatus.ACTIVE,
              qualityStatus: QualityStatus.PASSED,
            },
          });

      await prisma.stockMovement.create({
        data: {
          inventoryId: inventory.id,
          batchId: batch.id,
          movementType: MovementType.IN,
          quantity,
          beforeQuantity: batchIndex === 0 ? 0 : firstQty,
          afterQuantity: batchIndex === 0 ? firstQty : total,
          reason: 'Enterprise demo initial stock-in',
          referenceId: batchNumber,
          referenceType: 'DEMO_SEED',
          note: 'Seeded FIFO batch for demo inventory visibility',
          createdById: actorId,
        },
      });

      seededBatches.push({ batch, product, warehouse });
    }
  }

  return seededBatches;
}

async function seedSupplyChain(
  seededBatches: Awaited<ReturnType<typeof seedInventory>>,
  stages: Awaited<ReturnType<typeof seedLookups>>['stageMap'],
  actorId: string,
) {
  const flow = [
    [SupplyChainStageName.HARVEST, 'Harvest completed at registered source farm'],
    [SupplyChainStageName.PROCESSING, 'Processing completed under OCOP SOP'],
    [SupplyChainStageName.PACKAGING, 'Packaging and QR labeling completed'],
    [SupplyChainStageName.QUALITY_INSPECTION, 'Quality check passed'],
    [SupplyChainStageName.SHIPPING, 'Shipment dispatched to demo distribution route'],
    [SupplyChainStageName.CUSTOMER, 'Delivered to customer demo endpoint'],
  ] as const;

  for (const { batch, warehouse } of seededBatches.filter((_, index) => index % 2 === 0)) {
    await prisma.batchJourney.deleteMany({ where: { batchId: batch.id } });

    for (let index = 0; index < flow.length; index++) {
      const [stageName, note] = flow[index];
      const stage = stages.get(stageName);
      if (!stage) throw new Error(`Missing supply chain stage ${stageName}`);

      await prisma.batchJourney.create({
        data: {
          batchId: batch.id,
          stageId: stage.id,
          location: index < 3 ? 'Demo OCOP production facility' : warehouse.name,
          latitude: warehouse.latitude ? Number(warehouse.latitude) + index * 0.002 : undefined,
          longitude: warehouse.longitude ? Number(warehouse.longitude) + index * 0.002 : undefined,
          actorId,
          actorName: 'Enterprise Demo Operations Team',
          note,
          imageUrls: [`/images/demo/supply-chain-${index + 1}.jpg`],
          attachmentUrls: [],
          blockchainPayload: { demo: true, stage: stageName, batchNumber: batch.batchNumber },
        },
      });
    }
  }
}

async function seedCertificates(
  seededBatches: Awaited<ReturnType<typeof seedInventory>>,
  certMap: Awaited<ReturnType<typeof seedLookups>>['certMap'],
  createdById: string,
) {
  const certCodes = ['OCOP', 'VIETGAP', 'HACCP'] as const;
  for (let i = 0; i < Math.min(seededBatches.length, 30); i++) {
    const { batch, product } = seededBatches[i];
    const code = certCodes[i % certCodes.length];
    const type = certMap.get(code);
    if (!type) throw new Error(`Missing certificate type ${code}`);

    const certificateNumber = `DEMO-${code}-${String(i + 1).padStart(4, '0')}`;
    const documentHash = sha256(`${certificateNumber}:${product.id}:${batch.id}`);
    const existing = await prisma.certificate.findFirst({ where: { certificateNumber } });
    const certificate = existing
      ? await prisma.certificate.update({
          where: { id: existing.id },
          data: {
            certificateTypeId: type.id,
            productId: product.id,
            batchId: batch.id,
            status: CertificateStatus.ACTIVE,
            documentHash,
            deletedAt: null,
          },
        })
      : await prisma.certificate.create({
          data: {
            certificateNumber,
            certificateTypeId: type.id,
            productId: product.id,
            batchId: batch.id,
            issuingOrganization: code === 'OCOP' ? 'Vietnam OCOP Council' : `${code} Demo Certification Body`,
            issueDate: subDays(60 + i),
            expiryDate: addDays(365 + i),
            status: CertificateStatus.ACTIVE,
            verificationUrl: `https://demo.ocop.vn/certificates/${certificateNumber}`,
            note: `${code} demo certificate generated for enterprise demo data.`,
            createdById,
            documentHash,
            blockchainTxHash: `demo-${sha256(`${certificateNumber}:blockchain`).slice(0, 32)}`,
          },
        });

    await prisma.certificateFile.deleteMany({ where: { certificateId: certificate.id } });
    await prisma.certificateFile.create({
      data: {
        certificateId: certificate.id,
        fileName: `${certificateNumber}.pdf`,
        fileUrl: `https://storage.demo.ocop.vn/certificates/${certificateNumber}.pdf`,
        mimeType: 'application/pdf',
        fileSize: 256000 + i * 1024,
      },
    });
  }
}

async function seedProcurement(
  businesses: Awaited<ReturnType<typeof seedBusinesses>>,
  warehouses: Awaited<ReturnType<typeof seedWarehouses>>,
  products: Awaited<ReturnType<typeof seedProducts>>,
  batches: Awaited<ReturnType<typeof seedInventory>>,
  receivedById: string,
  approvedById: string,
) {
  const suppliers = [];
  for (let i = 0; i < 5; i++) {
    suppliers.push(
      await prisma.supplier.upsert({
        where: { code: `D-SUP-${String(i + 1).padStart(3, '0')}` },
        update: { isActive: true, rating: 4.2 + i * 0.1 },
        create: {
          code: `D-SUP-${String(i + 1).padStart(3, '0')}`,
          name: `Enterprise Demo Supplier ${i + 1}`,
          email: `supplier${i + 1}@demo.ocop.vn`,
          phone: `09120000${i + 1}`,
          taxCode: `SUP-DEMO-${i + 1}`,
          address: `${20 + i} Supplier Street, Vietnam`,
          supplierType: i % 2 === 0 ? SupplierType.FARMER : SupplierType.DISTRIBUTOR,
          country: 'Vietnam',
          province: 'Demo Province',
          paymentTerms: 'Net 15',
          rating: 4.2 + i * 0.1,
          contactPerson: `Supplier Contact ${i + 1}`,
          businessId: businesses[i % businesses.length].id,
        },
      }),
    );
  }

  for (let i = 0; i < 6; i++) {
    const business = businesses[i % businesses.length];
    const warehouse = warehouses[i % warehouses.length];
    const supplier = suppliers[i % suppliers.length];
    const code = `D-PO-${String(i + 1).padStart(4, '0')}`;
    const po = await prisma.purchaseOrder.upsert({
      where: { code },
      update: {
        status: POStatus.COMPLETED,
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        businessId: business.id,
        approvedById,
      },
      create: {
        code,
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        businessId: business.id,
        orderDate: subDays(25 - i),
        expectedDeliveryDate: subDays(15 - i),
        submittedAt: subDays(24 - i),
        approvedAt: subDays(23 - i),
        approvedById,
        notes: 'Enterprise demo purchase order for procurement workflow.',
        paymentTerms: 'Net 15',
        deliveryTerms: 'Delivered to OCOP warehouse',
        status: POStatus.COMPLETED,
      },
    });

    await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    for (let itemIndex = 0; itemIndex < 2; itemIndex++) {
      const product = products[(i * 2 + itemIndex) % products.length];
      await prisma.purchaseOrderItem.create({
        data: {
          purchaseOrderId: po.id,
          productId: product.id,
          quantity: 50 + itemIndex * 25,
          receivedQuantity: 50 + itemIndex * 25,
          unitPrice: product.price,
        },
      });
    }

    const grCode = `D-GR-${String(i + 1).padStart(4, '0')}`;
    const gr = await prisma.goodsReceipt.upsert({
      where: { code: grCode },
      update: { purchaseOrderId: po.id, warehouseId: warehouse.id, businessId: business.id, receivedById },
      create: {
        code: grCode,
        purchaseOrderId: po.id,
        warehouseId: warehouse.id,
        businessId: business.id,
        receivedById,
        receivedDate: subDays(14 - i),
        notes: 'Enterprise demo goods receipt with quality pass.',
      },
    });

    await prisma.goodsReceiptItem.deleteMany({ where: { goodsReceiptId: gr.id } });
    for (let itemIndex = 0; itemIndex < 2; itemIndex++) {
      const product = products[(i * 2 + itemIndex) % products.length];
      const batch = batches.find((candidate) => candidate.product.id === product.id)?.batch;
      await prisma.goodsReceiptItem.create({
        data: {
          goodsReceiptId: gr.id,
          productId: product.id,
          batchId: batch?.id,
          quantity: 50 + itemIndex * 25,
          rejectedQuantity: 0,
          damagedQuantity: itemIndex,
          qualityStatus: QualityStatusEnum.PASSED,
          expiryDate: addDays(240 + i),
        },
      });
    }
  }
}

async function seedEventsAndNotifications(users: Awaited<ReturnType<typeof seedUsers>>) {
  const coordinator = users.get('event.enterprise@demo.com');
  const seller = users.get('seller.enterprise@demo.com');
  const customer = users.get('customer.enterprise@demo.com');
  if (!coordinator || !seller || !customer) throw new Error('Missing demo notification users');

  const eventData = [
    ['demo-agricultural-fair-2026', 'Vietnam Agricultural Fair 2026', 'Agricultural Fair', 21.0278, 105.8342],
    ['demo-ocop-exhibition-2026', 'National OCOP Exhibition 2026', 'OCOP Exhibition', 10.0452, 105.7469],
  ] as const;

  const events = [];
  for (let i = 0; i < eventData.length; i++) {
    const [slug, title, eventType, latitude, longitude] = eventData[i];
    events.push(
      await prisma.event.upsert({
        where: { slug },
        update: {
          title,
          status: i === 0 ? EventStatus.ONGOING : EventStatus.PUBLISHED,
          updatedById: coordinator.id,
        },
        create: {
          title,
          slug,
          description: `${title} brings together OCOP enterprises, buyers and government stakeholders for product showcase and trade matching.`,
          summary: `${eventType} for enterprise demo.`,
          banner: `/images/demo/events/${slug}-banner.jpg`,
          coverImage: `/images/demo/events/${slug}-cover.jpg`,
          location: i === 0 ? 'Vietnam Exhibition Center, Hanoi' : 'Can Tho Promotion Center',
          latitude,
          longitude,
          startDate: addDays(7 + i * 20),
          endDate: addDays(10 + i * 20),
          registrationDeadline: addDays(5 + i * 20),
          organizer: 'Vietnam OCOP Demo Program',
          eventType,
          isFeatured: true,
          isPublic: true,
          registrationRequired: true,
          maxParticipants: 500,
          currentParticipants: 180 + i * 90,
          contactEmail: 'events@demo.ocop.vn',
          contactPhone: '0909000000',
          status: i === 0 ? EventStatus.ONGOING : EventStatus.PUBLISHED,
          createdById: coordinator.id,
          updatedById: coordinator.id,
        },
      }),
    );
  }

  const campaign = await prisma.notificationCampaign.upsert({
    where: { id: '00000000-0000-0000-0000-000000120101' },
    update: {
      eventId: events[0].id,
      status: 'COMPLETED',
      totalRecipients: 2,
      sentCount: 2,
      failedCount: 0,
    },
    create: {
      id: '00000000-0000-0000-0000-000000120101',
      eventId: events[0].id,
      targetAudience: NotificationTarget.ALL,
      targetDetails: { demo: true },
      title: 'Enterprise demo campaign: OCOP event invitation',
      message: 'Join the upcoming OCOP demo event and explore certified products with traceability.',
      sentAt: subDays(1),
      status: 'COMPLETED',
      totalRecipients: 2,
      sentCount: 2,
      failedCount: 0,
      readCount: 1,
      createdById: coordinator.id,
    },
  });

  for (const user of [seller, customer]) {
    await prisma.notificationRecipient.upsert({
      where: { campaignId_userId: { campaignId: campaign.id, userId: user.id } },
      update: { deliveryStatus: DeliveryStatus.SENT },
      create: { campaignId: campaign.id, userId: user.id, deliveryStatus: DeliveryStatus.SENT },
    });
  }

  await prisma.notification.deleteMany({
    where: {
      userId: { in: [seller.id, customer.id] },
      title: { in: ['New OCOP purchase order received', 'Your OCOP order is ready for tracking'] },
    },
  });
  await prisma.notification.createMany({
    data: [
      {
        userId: seller.id,
        title: 'New OCOP purchase order received',
        message: 'A demo purchase order has been completed and inventory is ready for shipment.',
        type: 'SUCCESS',
        link: '/dashboard/procurement/orders',
      },
      {
        userId: customer.id,
        title: 'Your OCOP order is ready for tracking',
        message: 'Demo traceability data is available with certificates, warehouse and delivery history.',
        type: 'INFO',
        link: '/products',
      },
    ],
  });
}

async function main() {
  console.log('Seeding enterprise OCOP demo dataset...');

  const roles = await seedRoles();
  const users = await seedUsers(roles);
  const lookups = await seedLookups();
  const locations = await seedLocations();
  const businesses = await seedBusinesses(locations, users.get('seller.enterprise@demo.com')!.id);
  const products = await seedProducts(businesses, lookups, users.get('admin.enterprise@demo.com')!.id);
  const warehouses = await seedWarehouses(businesses, users.get('warehouse.enterprise@demo.com')!.id);
  const batches = await seedInventory(products, warehouses, users.get('warehouse.enterprise@demo.com')!.id);
  await seedSupplyChain(batches, lookups.stageMap, users.get('warehouse.enterprise@demo.com')!.id);
  await seedCertificates(batches, lookups.certMap, users.get('admin.enterprise@demo.com')!.id);
  await seedProcurement(
    businesses,
    warehouses,
    products,
    batches,
    users.get('warehouse.enterprise@demo.com')!.id,
    users.get('admin.enterprise@demo.com')!.id,
  );
  await seedEventsAndNotifications(users);

  console.log('Enterprise OCOP demo dataset seeded successfully.');
  console.table({
    users: 5,
    businesses: businesses.length,
    products: products.length,
    warehouses: warehouses.length,
    inventoryBatches: batches.length,
    supplyChainJourneys: Math.floor(batches.length / 2) * 6,
    certificates: Math.min(batches.length, 30),
  });
}

main()
  .catch((error) => {
    console.error('Enterprise demo seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
