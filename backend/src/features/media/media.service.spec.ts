import { Test, TestingModule } from '@nestjs/testing';
import { MediaService } from './media.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, UnsupportedMediaTypeException, PayloadTooLargeException } from '@nestjs/common';

describe('MediaService', () => {
  let service: MediaService;
  let minioClientMock: any;

  beforeEach(async () => {
    const configServiceMock = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
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
    (service as any).minioClient = minioClientMock;
    (service as any).bucketName = 'test-bucket';
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
      buffer: Buffer.from('fake image data'),
      size: 1000,
    } as any;

    it('should upload successfully', async () => {
      const result = await service.uploadImage(validFile, 'products');

      expect(result.url).toContain('test-bucket/products/');
      expect(result.mimeType).toBe('image/jpeg');
      expect(minioClientMock.putObject).toHaveBeenCalled();
    });

    it('should throw BadRequestException if no file is provided', async () => {
      await expect(service.uploadImage(null as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw UnsupportedMediaTypeException for invalid mime types', async () => {
      const invalidFile = { ...validFile, mimetype: 'text/plain', originalname: 'test.txt' };
      await expect(service.uploadImage(invalidFile)).rejects.toThrow(UnsupportedMediaTypeException);
    });

    it('should throw PayloadTooLargeException for files > 10MB', async () => {
      const hugeFile = { ...validFile, size: 11 * 1024 * 1024 }; // 11MB
      await expect(service.uploadImage(hugeFile)).rejects.toThrow(PayloadTooLargeException);
    });
  });

  describe('deleteImage', () => {
    it('should call removeObject successfully', async () => {
      await service.deleteImage('products/image-name.jpg');
      expect(minioClientMock.removeObject).toHaveBeenCalledWith('test-bucket', 'products/image-name.jpg');
    });

    it('should throw BadRequestException if objectName is missing', async () => {
      await expect(service.deleteImage('')).rejects.toThrow(BadRequestException);
    });
  });
});
