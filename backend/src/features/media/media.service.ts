import {
  Injectable,
  OnModuleInit,
  BadRequestException,
  UnsupportedMediaTypeException,
  PayloadTooLargeException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';

@Injectable()
export class MediaService implements OnModuleInit {
  private readonly logger = new Logger(MediaService.name);

  private readonly minioClient: Client;
  private readonly bucketName: string;
  private readonly demoMode: boolean;

  constructor(private readonly configService: ConfigService) {
    this.demoMode = this.configService.get<boolean>('DEMO_MODE', false);

    this.minioClient = new Client({
      endPoint: this.configService.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: Number(this.configService.get<number>('MINIO_PORT', 9000)),
      useSSL: this.configService.get<boolean>('MINIO_USE_SSL', false),
      accessKey: this.configService.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.configService.get<string>('MINIO_SECRET_KEY', 'minioadmin'),
    });

    this.bucketName =
      this.configService.get<string>('MINIO_BUCKET') ??
      this.configService.get<string>('MINIO_BUCKET_NAME', 'ocop-vietnam');
  }

  async onModuleInit() {
    // Demo mode => không kết nối MinIO
    if (this.demoMode) {
      this.logger.log('DEMO_MODE=true, bỏ qua khởi tạo MinIO.');
      return;
    }

    try {
      const bucketExists = await this.minioClient.bucketExists(this.bucketName);

      if (!bucketExists) {
        await this.minioClient.makeBucket(this.bucketName, 'us-east-1');

        const policy = {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: '*',
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${this.bucketName}/*`],
            },
          ],
        };

        await this.minioClient.setBucketPolicy(
          this.bucketName,
          JSON.stringify(policy),
        );

        this.logger.log(`Đã tạo bucket ${this.bucketName}`);
      } else {
        this.logger.log(`Bucket ${this.bucketName} đã tồn tại`);
      }
    } catch (err) {
      this.logger.error('Lỗi khi cấu hình bucket MinIO', err);
      throw err;
    }
  }

  async uploadImage(
    file: Express.Multer.File,
    folder = 'products',
  ) {
    if (this.demoMode) {
      throw new BadRequestException(
        'Tính năng upload bị tắt ở chế độ DEMO.',
      );
    }

    if (!file) {
      throw new BadRequestException('Không tìm thấy file tải lên');
    }

    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new UnsupportedMediaTypeException(
        'Chỉ cho phép jpg, jpeg, png, webp, pdf, doc, docx',
      );
    }

    const fileExt = (file.originalname.split('.').pop() || '').toLowerCase();

    const allowedExtensions = [
      'jpg',
      'jpeg',
      'png',
      'webp',
      'pdf',
      'doc',
      'docx',
    ];

    if (!allowedExtensions.includes(fileExt)) {
      throw new UnsupportedMediaTypeException(
        `Đuôi file .${fileExt} không được phép`,
      );
    }

    const maxSizeBytes = 10 * 1024 * 1024;

    if (file.size > maxSizeBytes) {
      throw new PayloadTooLargeException(
        'Kích thước file vượt quá giới hạn 10MB',
      );
    }

    const randomName = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

    const objectName = `${folder}/${randomName}.${fileExt}`;

    await this.minioClient.putObject(
      this.bucketName,
      objectName,
      file.buffer,
      file.size,
      {
        'Content-Type': file.mimetype,
      },
    );

    return {
      url: this.generatePublicUrl(objectName),
      objectName,
      size: file.size,
      mimeType: file.mimetype,
    };
  }

  async deleteImage(objectName: string): Promise<void> {
    if (this.demoMode) {
      return;
    }

    if (!objectName) {
      throw new BadRequestException('objectName là bắt buộc');
    }

    try {
      await this.minioClient.removeObject(
        this.bucketName,
        objectName,
      );
    } catch (err) {
      throw new BadRequestException(
        `Không thể xóa object "${objectName}" khỏi MinIO: ${err.message}`,
      );
    }
  }

  generatePublicUrl(objectName: string): string {
    const endPoint = this.configService.get<string>(
      'MINIO_ENDPOINT',
      'localhost',
    );

    const port = Number(
      this.configService.get<number>('MINIO_PORT', 9000),
    );

    const useSSL = this.configService.get<boolean>(
      'MINIO_USE_SSL',
      false,
    );

    const protocol = useSSL ? 'https' : 'http';

    if (port === 80 || port === 443) {
      return `${protocol}://${endPoint}/${this.bucketName}/${objectName}`;
    }

    return `${protocol}://${endPoint}:${port}/${this.bucketName}/${objectName}`;
  }
}