import { Test, TestingModule } from '@nestjs/testing';
import { MediaService } from './media.service';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  UnsupportedMediaTypeException,
  PayloadTooLargeException,
  ForbiddenException,
} from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { promises as fs } from 'fs';
import { Readable } from 'stream';

jest.mock('fs', () => ({
  ...jest.requireActual<typeof import('fs')>('fs'),
  promises: {
    ...jest.requireActual<typeof import('fs')>('fs').promises,
    mkdir: jest.fn(),
    writeFile: jest.fn(),
  },
}));

describe('MediaService', () => {
  const seller = { id: 'seller-a', role: RoleName.SELLER } as RequestUser;
  const otherSeller = { id: 'seller-b', role: RoleName.SELLER } as RequestUser;
  const admin = { id: 'admin', role: RoleName.ADMIN } as RequestUser;
  let service: MediaService;
  let minioClientMock: {
    bucketExists: jest.Mock;
    makeBucket: jest.Mock;
    setBucketPolicy: jest.Mock;
    putObject: jest.Mock;
    removeObject: jest.Mock;
  };

  beforeEach(async () => {
    const configServiceMock = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue?: unknown) => {
          if (key === 'MINIO_ENDPOINT') return 'localhost';
          if (key === 'MINIO_PORT') return 9000;
          if (key === 'MINIO_USE_SSL') return false;
          if (key === 'MINIO_ACCESS_KEY') return 'minioadmin';
          if (key === 'MINIO_SECRET_KEY') return 'minioadmin';
          if (key === 'MINIO_BUCKET_NAME') return 'test-bucket';
          return defaultValue;
        }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);

    // Mock MinIO Client nội bộ của MediaService
    minioClientMock = {
      bucketExists: jest.fn().mockResolvedValue(true),
      makeBucket: jest.fn(),
      setBucketPolicy: jest.fn(),
      putObject: jest.fn().mockResolvedValue({}),
      removeObject: jest.fn().mockResolvedValue(true),
    };
    const internals = service as unknown as {
      minioClient: typeof minioClientMock;
      bucketName: string;
    };
    internals.minioClient = minioClientMock;
    internals.bucketName = 'test-bucket';
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('uploadImage', () => {
    const validFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'coffee.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      buffer: Buffer.from('ffd8ffe000104a4649460001', 'hex'),
      size: 1000,
      destination: '',
      filename: 'coffee.jpg',
      path: '',
      stream: Readable.from(Buffer.from('ffd8ffe000104a4649460001', 'hex')),
    };

    it('should upload successfully', async () => {
      const result = await service.uploadImage(validFile, 'products', seller);

      expect(result.url).toContain('test-bucket/products/seller-a/');
      expect(result.mimeType).toBe('image/jpeg');
      expect(minioClientMock.putObject).toHaveBeenCalled();
    });

    it('should allow uploading to shipments folder', async () => {
      const result = await service.uploadImage(validFile, 'shipments', seller);
      expect(result.url).toContain('test-bucket/shipments/');
      expect(minioClientMock.putObject).toHaveBeenCalled();
    });

    it('should throw BadRequestException if no file is provided', async () => {
      await expect(
        service.uploadImage(
          null as unknown as Express.Multer.File,
          'products',
          seller,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw UnsupportedMediaTypeException for invalid mime types', async () => {
      const invalidFile = {
        ...validFile,
        mimetype: 'text/plain',
        originalname: 'test.txt',
      };
      await expect(
        service.uploadImage(invalidFile, 'products', seller),
      ).rejects.toThrow(UnsupportedMediaTypeException);
    });
    it('rejects spoofed JPEG bytes', async () => {
      await expect(
        service.uploadImage(
          { ...validFile, buffer: Buffer.from('not a jpeg') },
          'products',
          seller,
        ),
      ).rejects.toThrow(UnsupportedMediaTypeException);
      expect(minioClientMock.putObject).not.toHaveBeenCalled();
    });

    it('should throw PayloadTooLargeException for files > 10MB', async () => {
      const hugeFile = { ...validFile, size: 11 * 1024 * 1024 }; // 11MB
      await expect(
        service.uploadImage(hugeFile, 'products', seller),
      ).rejects.toThrow(PayloadTooLargeException);
    });

    it('should reject an unknown upload folder', async () => {
      await expect(
        service.uploadImage(validFile, '../outside', seller),
      ).rejects.toThrow(BadRequestException);
    });

    it('should store evidence locally when demo mode is enabled', async () => {
      const demoConfig = {
        get: jest.fn((key: string, defaultValue?: unknown) => {
          if (key === 'DEMO_MODE') return true;
          if (key === 'MINIO_BUCKET_NAME') return 'demo-bucket';
          if (key === 'PORT') return 3001;
          return defaultValue;
        }),
      };
      const demoService = new MediaService(
        demoConfig as unknown as ConfigService,
      );

      const result = await demoService.uploadImage(
        validFile,
        'supply-chain',
        seller,
      );

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
      expect(result.url).toContain(
        'http://localhost:3001/assets/uploads/supply-chain/',
      );
    });
  });

  describe('deleteImage', () => {
    it('should call removeObject successfully', async () => {
      await service.deleteImage(
        'products/seller-a/123e4567-e89b-42d3-a456-426614174000.jpg',
        seller,
      );
      expect(minioClientMock.removeObject).toHaveBeenCalledWith(
        'test-bucket',
        'products/seller-a/123e4567-e89b-42d3-a456-426614174000.jpg',
      );
    });

    it('should throw BadRequestException if objectName is missing', async () => {
      await expect(service.deleteImage('', seller)).rejects.toThrow(
        BadRequestException,
      );
    });
    it('rejects a seller deleting another seller file', async () => {
      await expect(
        service.deleteImage(
          'products/seller-a/123e4567-e89b-42d3-a456-426614174000.jpg',
          otherSeller,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(minioClientMock.removeObject).not.toHaveBeenCalled();
    });
    it('allows an admin to remove a legacy file', async () => {
      await service.deleteImage('products/legacy.jpg', admin);
      expect(minioClientMock.removeObject).toHaveBeenCalled();
    });
  });

  describe('generatePublicUrl', () => {
    it('uses MINIO_PUBLIC_URL when configured to separate internal endpoint from browser URL', () => {
      const configServiceMock = {
        get: jest.fn().mockImplementation((key: string, defaultValue?: unknown) => {
          if (key === 'MINIO_ENDPOINT') return 'minio-internal.docker';
          if (key === 'MINIO_PORT') return 9000;
          if (key === 'MINIO_BUCKET_NAME') return 'ocop-media';
          if (key === 'MINIO_PUBLIC_URL') return 'https://media.ocop.gov.vn';
          return defaultValue;
        }),
      };
      const customService = new MediaService(configServiceMock as unknown as ConfigService);
      const url = customService.generatePublicUrl('products/seller-1/image-123.jpg');
      expect(url).toBe('https://media.ocop.gov.vn/ocop-media/products/seller-1/image-123.jpg');
      expect(url).not.toContain('minio-internal.docker');
    });

    it('falls back to MINIO_ENDPOINT and MINIO_PORT when MINIO_PUBLIC_URL is not set', () => {
      const url = service.generatePublicUrl('products/seller-a/image.png');
      expect(url).toBe('http://localhost:9000/test-bucket/products/seller-a/image.png');
    });
  });
});
