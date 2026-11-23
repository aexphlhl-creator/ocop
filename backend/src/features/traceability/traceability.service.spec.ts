import { TraceabilityService } from './traceability.service';
import { PrismaService } from '../prisma/prisma.service';
import type { StorageProvider } from '../certificates/storage/storage-provider.interface';

describe('TraceabilityService', () => {
  const qualityJourneyId = '00000000-0000-4000-8000-000000000010';
  const warehouseJourneyId = '00000000-0000-4000-8000-000000000011';
  const eventTime = new Date('2026-08-21T08:00:00.000Z');

  const prisma = {
    product: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    blockchainRecord: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const storageProvider = {
    getDownloadUrl: jest.fn((value: string) => Promise.resolve(value)),
  };

  const createProduct = (qualityStatus: 'PASSED' | 'PENDING_CHECK') => ({
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Mật ong OCOP',
    slug: 'mat-ong-ocop',
    description: 'Sản phẩm kiểm thử',
    price: 120000,
    unit: 'hộp',
    categoryId: '00000000-0000-4000-8000-000000000002',
    latitude: null,
    longitude: null,
    harvestDate: null,
    images: [{ imageUrl: '/honey.jpg', isPrimary: true }],
    sellerId: '00000000-0000-4000-8000-000000000009',
    seller: {
      id: '00000000-0000-4000-8000-000000000009',
      fullName: 'Người bán OCOP',
      phone: null,
      sellerProfile: {
        displayName: 'Gian hàng OCOP',
        address: 'Hà Nội',
        phone: null,
        isVerified: true,
      },
    },
    province: { name: 'Hà Nội' },
    ward: { name: 'Ba Đình' },
    category: { name: 'Thực phẩm', slug: 'thuc-pham' },
    ocopLevel: { level: 4, title: 'OCOP 4 sao', icon: null },
    inventories: [
      {
        currentQuantity: 10,
        reservedQuantity: 0,
        warehouse: { name: 'Kho trung tâm', address: 'Hà Nội' },
        batches: [
          {
            id: '00000000-0000-4000-8000-000000000020',
            batchNumber: 'LOT-001',
            quantity: 10,
            initialQuantity: 10,
            manufactureDate: eventTime,
            harvestDate: null,
            expiryDate: new Date('2027-08-21T00:00:00.000Z'),
            receivedDate: eventTime,
            supplier: null,
            warehouseLocation: 'Kệ A1',
            status: 'ACTIVE',
            qualityStatus,
            certificates: [] as unknown[],
            originDeclarations: [
              {
                id: '00000000-0000-4000-8000-000000000030',
                revision: 1,
                sourceLotCode: 'FARM-LOT-001',
                countryCode: 'VN',
                harvestDate: eventTime,
                manufactureDate: null,
                productionMethod: 'Nuôi ong tự nhiên',
                evidenceUrls: ['https://evidence.test/origin.jpg'],
                declaredAt: eventTime,
                party: {
                  code: 'HTX-001',
                  name: 'HTX OCOP',
                  isVerified: true,
                },
                location: {
                  code: 'FARM-001',
                  name: 'Trang trại OCOP',
                  address: 'Hà Nội',
                  latitude: 21.02,
                  longitude: 105.84,
                  isVerified: true,
                },
              },
            ],
            outputMaterialLinks: [] as unknown[],
            shipmentItems: [],
            journeys: [
              {
                id: qualityJourneyId,
                stage: {
                  name: 'QUALITY_INSPECTION',
                  displayName: 'Kiểm định chất lượng',
                  icon: null,
                  color: null,
                  order: 3,
                },
                location: 'Kho trung tâm',
                latitude: 21.02,
                longitude: 105.84,
                actorName: 'Nhân viên kho',
                note: 'Đã bàn giao',
                imageUrls: ['/proof.jpg'],
                attachmentUrls: ['/proof.pdf'],
                eventTime,
                referenceCode: 'QC-001',
                carrierName: null,
                recipientName: null,
                blockchainPayload: { qualityStatus },
                createdAt: new Date('2026-08-21T08:05:00.000Z'),
              },
              {
                id: warehouseJourneyId,
                stage: {
                  name: 'WAREHOUSE',
                  displayName: 'Nhập kho',
                  icon: null,
                  color: null,
                  order: 6,
                },
                location: 'Kho trung tâm',
                latitude: 21.02,
                longitude: 105.84,
                actorName: 'Nhân viên kho',
                note: 'Đã nhập kho',
                imageUrls: ['/proof.jpg'],
                attachmentUrls: ['/proof.pdf'],
                eventTime: new Date('2026-08-21T09:00:00.000Z'),
                referenceCode: 'GR-001',
                carrierName: null,
                recipientName: null,
                blockchainPayload: { qualityStatus },
                createdAt: new Date('2026-08-21T09:05:00.000Z'),
              },
            ],
          },
        ],
      },
    ],
    certificates: [] as unknown[],
    orderItems: [],
  });

  let service: TraceabilityService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.product.findMany.mockResolvedValue([]);
    service = new TraceabilityService(
      prisma as unknown as PrismaService,
      storageProvider as unknown as StorageProvider,
    );
  });

  it('only marks a traceability profile fully verified with passed QC and confirmed blockchain records', async () => {
    prisma.product.findFirst.mockResolvedValue(createProduct('PASSED'));
    prisma.blockchainRecord.findMany.mockResolvedValue([
      {
        journeyId: qualityJourneyId,
        status: 'CONFIRMED',
        transactionHash: '0xconfirmed',
        txId: null,
        explorerUrl: 'https://explorer.test/0xconfirmed',
        confirmations: 12,
        confirmedAt: new Date('2026-08-21T08:10:00.000Z'),
        createdAt: new Date('2026-08-21T08:06:00.000Z'),
      },
      {
        journeyId: warehouseJourneyId,
        status: 'CONFIRMED',
        transactionHash: '0xwarehouse',
        txId: null,
        explorerUrl: 'https://explorer.test/0xwarehouse',
        confirmations: 12,
        confirmedAt: new Date('2026-08-21T09:10:00.000Z'),
        createdAt: new Date('2026-08-21T09:06:00.000Z'),
      },
    ]);

    const result = await service.getProductTraceability(
      '00000000-0000-4000-8000-000000000001',
    );

    expect(result.summary.traceabilityVerification).toMatchObject({
      qualityVerified: true,
      blockchainVerified: true,
      fullyVerified: true,
      blockchainConfirmedCount: 2,
      blockchainJourneyCount: 2,
    });
    expect(
      result.supplyChainTimeline.find(
        (event) => event.source === 'BATCH_JOURNEY',
      ),
    ).toMatchObject({
      time: eventTime,
      qualityStatus: 'PASSED',
      referenceCode: 'QC-001',
      attachmentUrls: ['/proof.pdf'],
      blockchainVerification: {
        verified: true,
        txHash: '0xconfirmed',
      },
    });
  });

  it('does not claim verification while quality or blockchain confirmation is pending', async () => {
    prisma.product.findFirst.mockResolvedValue(createProduct('PENDING_CHECK'));
    prisma.blockchainRecord.findMany.mockResolvedValue([]);

    const result = await service.getProductTraceability(
      '00000000-0000-4000-8000-000000000001',
    );

    expect(result.summary.traceabilityVerification).toMatchObject({
      qualityVerified: false,
      blockchainVerified: false,
      fullyVerified: false,
      blockchainConfirmedCount: 0,
      blockchainJourneyCount: 2,
    });
    expect(result.summary.blockchain).toMatchObject({
      verified: false,
      status: 'NOT_RECORDED',
      txHash: null,
      explorerUrl: null,
      confirmations: 0,
      timestamp: null,
    });
    expect(
      result.supplyChainTimeline.find(
        (event) => event.source === 'BATCH_JOURNEY',
      )?.blockchainVerification,
    ).toMatchObject({ verified: false, status: null, txHash: null });
  });

  it('returns material links consumed by the output batch, not downstream usages', async () => {
    const product = createProduct('PASSED');
    product.inventories[0].batches[0].journeys.splice(1, 0, {
      ...product.inventories[0].batches[0].journeys[0],
      id: '00000000-0000-4000-8000-000000000012',
      stage: {
        name: 'PROCESSING',
        displayName: 'Chế biến',
        icon: null,
        color: null,
        order: 4,
      },
    });
    product.inventories[0].batches[0].outputMaterialLinks = [
      {
        id: '00000000-0000-4000-8000-000000000040',
        quantity: 5,
        unit: 'kg',
        processReference: 'PROCESS-001',
        evidenceUrls: ['/material-proof.jpg'],
        createdAt: eventTime,
        inputBatch: {
          id: '00000000-0000-4000-8000-000000000041',
          batchNumber: 'RAW-LOT-001',
          inventory: {
            product: {
              id: '00000000-0000-4000-8000-000000000042',
              name: 'Mật ong nguyên liệu',
            },
          },
          originDeclarations: [],
        },
      },
    ];
    prisma.product.findFirst.mockResolvedValue(product);
    prisma.blockchainRecord.findMany.mockResolvedValue([]);

    const result = await service.getProductTraceability(product.id);

    expect(result.batches[0].inputMaterials).toHaveLength(1);
    expect(result.batches[0].inputMaterials[0]).toMatchObject({
      processReference: 'PROCESS-001',
      batch: { batchNumber: 'RAW-LOT-001' },
    });
    expect(result.batches[0].traceabilityVerification.missing).not.toContain(
      'TRANSFORMATION_LINKS',
    );
  });

  it('deduplicates a certificate attached to both the product and its batch', async () => {
    const product = createProduct('PASSED');
    const certificate = {
      id: '00000000-0000-4000-8000-000000000050',
      certificateNumber: 'OCOP-UNIQUE-001',
      issuingOrganization: 'OCOP Council',
      issueDate: eventTime,
      expiryDate: new Date('2027-08-21T00:00:00.000Z'),
      status: 'ACTIVE',
      verificationUrl: null,
      documentHash: 'hash',
      blockchainTxHash: null,
      certificateType: { code: 'OCOP', name: 'OCOP' },
      files: [],
    };
    product.certificates = [certificate];
    product.inventories[0].batches[0].certificates = [certificate];
    prisma.product.findFirst.mockResolvedValue(product);
    prisma.blockchainRecord.findMany.mockResolvedValue([]);
    prisma.blockchainRecord.findFirst.mockResolvedValue(null);

    const result = await service.getProductTraceability(product.id);

    expect(result.certificates).toHaveLength(1);
    expect(result.certificates[0].certificateNumber).toBe('OCOP-UNIQUE-001');
  });
});
