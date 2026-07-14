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

  private minioClient?: Client;
  private readonly bucketName: string;
  private readonly demoMode: boolean;

  constructor(private readonly configService: ConfigService) {
    this.demoMode = this.configService.get<boolean>('DEMO_MODE', false);
    this.bucketName =
      this.configService.get<string>('MINIO_BUCKET') ??
      this.configService.get<string>('MINIO_BUCKET_NAME', 'ocop-vietnam');

    if (this.demoMode) {
      this.logger.log('[MediaService] DEMO_MODE=true -> Skip MinIO client initialization');
      return;
    }

    this.minioClient = this.createMinioClient();
  }

  async onModuleInit() {
    if (this.demoMode) {
      this.logger.log('[MediaService] DEMO_MODE=true -> Skip MinIO bucket initialization');
      return;
    }

    try {
      const bucketExists = await this.getMinioClient().bucketExists(this.bucketName);

      if (!bucketExists) {
        await this.getMinioClient().makeBucket(this.bucketName, 'us-east-1');

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

        await this.getMinioClient().setBucketPolicy(
          this.bucketName,
          JSON.stringify(policy),
        );

        this.logger.log(`Created MinIO bucket ${this.bucketName}`);
      } else {
        this.logger.log(`MinIO bucket ${this.bucketName} already exists`);
      }
    } catch (err) {
      this.logger.error('Failed to configure MinIO bucket', err);
      throw err;
    }
  }

  async uploadImage(
    file: Express.Multer.File,
    folder = 'products',
  ) {
    if (this.demoMode) {
      this.logger.warn('[MediaService] DEMO_MODE=true -> Skip MinIO upload');
      throw new BadRequestException(
        'Upload is disabled in demo mode.',
      );
    }

    if (!file) {
      throw new BadRequestException('No upload file was provided');
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
        'Only jpg, jpeg, png, webp, pdf, doc, and docx files are allowed',
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
        `File extension .${fileExt} is not allowed`,
      );
    }

    const maxSizeBytes = 10 * 1024 * 1024;

    if (file.size > maxSizeBytes) {
      throw new PayloadTooLargeException(
        'File size exceeds the 10MB limit',
      );
    }

    const randomName = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

    const objectName = `${folder}/${randomName}.${fileExt}`;

    await this.getMinioClient().putObject(
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
      this.logger.warn('[MediaService] DEMO_MODE=true -> Skip MinIO delete');
      return;
    }

    if (!objectName) {
      throw new BadRequestException('objectName is required');
    }

    try {
      await this.getMinioClient().removeObject(
        this.bucketName,
        objectName,
      );
    } catch (err) {
      throw new BadRequestException(
        `Unable to delete object "${objectName}" from MinIO: ${err.message}`,
      );
    }
  }

  generatePublicUrl(objectName: string): string {
    if (this.demoMode) {
      this.logger.warn('[MediaService] DEMO_MODE=true -> Skip MinIO public URL generation');
      return objectName;
    }

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

  private createMinioClient(): Client {
    return new Client({
      endPoint: this.configService.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: Number(this.configService.get<number>('MINIO_PORT', 9000)),
      useSSL: this.configService.get<boolean>('MINIO_USE_SSL', false),
      accessKey: this.configService.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.configService.get<string>('MINIO_SECRET_KEY', 'minioadmin'),
    });
  }

  private getMinioClient(): Client {
    if (!this.minioClient) {
      this.minioClient = this.createMinioClient();
    }
    return this.minioClient;
  }
}
