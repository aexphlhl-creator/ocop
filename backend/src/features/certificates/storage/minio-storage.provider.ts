import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { extname } from 'path';
import { Client } from 'minio';
import { StorageProvider, StoredFile } from './storage-provider.interface';
import { matchesUploadedFileSignature } from '../../../common/utils/uploaded-file-signature';

@Injectable()
export class MinioStorageProvider implements StorageProvider, OnModuleInit {
  private readonly logger = new Logger(MinioStorageProvider.name);
  private readonly client: Client;
  private readonly bucketName: string;
  private readonly maxSizeBytes = 20 * 1024 * 1024;
  private readonly allowedMimeTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
  ];
  private initialized = false;

  constructor(private readonly configService: ConfigService) {
    this.client = new Client({
      endPoint: this.configService.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: Number(this.configService.get<number>('MINIO_PORT', 9000)),
      useSSL: this.configService.get<boolean>('MINIO_USE_SSL', false),
      accessKey: this.configService.get<string>('MINIO_ACCESS_KEY', ''),
      secretKey: this.configService.get<string>('MINIO_SECRET_KEY', ''),
    });
    this.bucketName =
      this.configService.get<string>('MINIO_BUCKET') ??
      this.configService.get<string>('MINIO_BUCKET_NAME') ??
      'ocop-vietnam';
  }

  async onModuleInit() {
    try {
      const exists = await this.client.bucketExists(this.bucketName);
      if (!exists) {
        await this.client.makeBucket(this.bucketName, 'us-east-1');
      }
    } catch (error) {
      this.logger.error(
        'Không thể khởi tạo bucket MinIO cho certificate storage',
        error,
      );
      throw error;
    }
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      const exists = await this.client.bucketExists(this.bucketName);
      if (!exists) {
        await this.client.makeBucket(this.bucketName, 'us-east-1');
      }
      this.initialized = true;
    } catch (error) {
      this.logger.error(
        'Failed to initialize MinIO bucket for certificate storage',
        error,
      );
      throw error;
    }
  }

  async upload(file: Express.Multer.File, folder: string): Promise<StoredFile> {
    if (!file) {
      throw new BadRequestException('Không tìm thấy file tải lên');
    }
    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Chỉ cho phép tải lên chứng nhận định dạng PDF, PNG, JPG hoặc JPEG',
      );
    }
    if (file.size > this.maxSizeBytes) {
      throw new PayloadTooLargeException(
        'Kích thước file vượt quá giới hạn cho phép (20MB)',
      );
    }
    if (!matchesUploadedFileSignature(file)) {
      throw new BadRequestException(
        'Nội dung file không khớp định dạng chứng nhận',
      );
    }

    const extension = this.normalizeExtension(file.originalname, file.mimetype);
    const objectName = `${folder}/${randomUUID()}${extension}`;
    const documentHash = createHash('sha256').update(file.buffer).digest('hex');

    await this.client.putObject(
      this.bucketName,
      objectName,
      file.buffer,
      file.size,
      {
        'Content-Type': file.mimetype,
        'X-Document-Hash': documentHash,
      },
    );

    return {
      fileName: file.originalname,
      fileUrl: objectName,
      mimeType: file.mimetype,
      fileSize: file.size,
      documentHash,
    };
  }

  async getDownloadUrl(fileUrl: string): Promise<string> {
    if (
      !fileUrl ||
      fileUrl.startsWith('/assets/') ||
      /^https?:\/\//i.test(fileUrl)
    ) {
      return fileUrl;
    }

    return this.client.presignedGetObject(this.bucketName, fileUrl, 60 * 15);
  }

  private extensionFromMime(mimeType: string) {
    if (mimeType === 'application/pdf') return '.pdf';
    if (mimeType === 'image/png') return '.png';
    return '.jpg';
  }

  private normalizeExtension(originalName: string, mimeType: string) {
    const extension = extname(originalName).toLowerCase();
    if (['.pdf', '.png', '.jpg', '.jpeg'].includes(extension)) {
      return extension;
    }
    return this.extensionFromMime(mimeType);
  }
}
