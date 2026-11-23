import {
  Injectable,
  OnModuleInit,
  BadRequestException,
  UnsupportedMediaTypeException,
  PayloadTooLargeException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { RoleName } from '@prisma/client';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { matchesUploadedFileSignature } from '../../common/utils/uploaded-file-signature';

export const PUBLIC_MEDIA_FOLDERS = [
  'products',
  'avatars',
  'news',
  'events',
] as const;

export const RESTRICTED_SENSITIVE_FOLDERS = [
  'certificates',
  'supply-chain',
  'shipments',
  'documents',
] as const;

export function buildRestrictedMediaBucketPolicy(bucketName: string) {
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'PublicMediaReadOnlyAccess',
        Effect: 'Allow',
        Principal: '*',
        Action: ['s3:GetObject'],
        Resource: PUBLIC_MEDIA_FOLDERS.map(
          (folder) => `arn:aws:s3:::${bucketName}/${folder}/*`,
        ),
      },
    ],
  };
}

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
      this.logger.log(
        '[MediaService] DEMO_MODE=true -> Skip MinIO client initialization',
      );
      return;
    }

    this.minioClient = this.createMinioClient();
  }

  async onModuleInit() {
    if (this.demoMode) {
      this.logger.log(
        '[MediaService] DEMO_MODE=true -> Skip MinIO bucket initialization',
      );
      return;
    }

    try {
      const bucketExists = await this.getMinioClient().bucketExists(
        this.bucketName,
      );

      if (!bucketExists) {
        await this.getMinioClient().makeBucket(this.bucketName, 'us-east-1');
        this.logger.log(`Created MinIO bucket ${this.bucketName}`);
      } else {
        this.logger.log(`MinIO bucket ${this.bucketName} already exists`);
      }

      // Enforce prefix-restricted policy: ONLY designated public folders (products, avatars, news, events) are public.
      // Certificates, supply-chain, shipments, and documents remain strictly private (NO wildcard /*).
      const policy = buildRestrictedMediaBucketPolicy(this.bucketName);
      await this.getMinioClient().setBucketPolicy(
        this.bucketName,
        JSON.stringify(policy),
      );
      this.logger.log(
        `Applied restricted bucket policy to ${this.bucketName} (public prefixes: ${PUBLIC_MEDIA_FOLDERS.join(', ')})`,
      );
    } catch (err) {
      this.logger.error('Failed to configure MinIO bucket', err);
      throw err;
    }
  }

  async uploadImage(
    file: Express.Multer.File,
    folder = 'products',
    user: RequestUser,
  ) {
    if (!file) {
      throw new BadRequestException('No upload file was provided');
    }

    const allowedFolders = new Set([
      'products',
      'avatars',
      'news',
      'supply-chain',
      'shipments',
      'events',
    ]);
    if (!allowedFolders.has(folder)) {
      throw new BadRequestException('Upload folder is not allowed');
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
      throw new PayloadTooLargeException('File size exceeds the 10MB limit');
    }

    if (!matchesUploadedFileSignature(file)) {
      throw new UnsupportedMediaTypeException(
        'File content does not match its type',
      );
    }

    const randomName = randomUUID();

    const objectName = `${folder}/${user.id}/${randomName}.${fileExt}`;

    if (this.demoMode) {
      const uploadDir = join(
        process.cwd(),
        'assets',
        'uploads',
        folder,
        user.id,
      );
      // Folder is restricted by allowedFolders and filename is server-generated.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await fs.mkdir(uploadDir, { recursive: true });
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await fs.writeFile(
        join(uploadDir, `${randomName}.${fileExt}`),
        file.buffer,
      );
      const port = this.configService.get<number>('PORT', 3001);
      this.logger.log(`DEMO_MODE local upload: ${objectName}`);
      return {
        url: `http://localhost:${port}/assets/uploads/${objectName}`,
        objectName: `uploads/${objectName}`,
        size: file.size,
        mimeType: file.mimetype,
      };
    }

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

  async deleteImage(objectName: string, user: RequestUser): Promise<void> {
    if (!objectName) {
      throw new BadRequestException('objectName is required');
    }

    const [folder, ownerId, fileName, extra] = objectName.split('/');
    const sellerOwnsFile =
      !extra &&
      [
        'products',
        'avatars',
        'news',
        'supply-chain',
        'shipments',
        'events',
      ].includes(folder) &&
      ownerId === user.id &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|pdf|doc|docx)$/i.test(
        fileName,
      );
    if (user.role !== RoleName.ADMIN && !sellerOwnsFile) {
      throw new ForbiddenException('Không có quyền xóa tệp này');
    }

    if (this.demoMode) {
      this.logger.warn('[MediaService] DEMO_MODE=true -> Skip MinIO delete');
      return;
    }

    try {
      await this.getMinioClient().removeObject(this.bucketName, objectName);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(
        `Unable to delete object "${objectName}" from MinIO: ${message}`,
      );
    }
  }

  generatePublicUrl(objectName: string): string {
    if (this.demoMode) {
      this.logger.warn(
        '[MediaService] DEMO_MODE=true -> Skip MinIO public URL generation',
      );
      return objectName;
    }

    const publicUrl = this.configService.get<string>('MINIO_PUBLIC_URL');
    if (publicUrl && publicUrl.trim()) {
      const cleanBase = publicUrl.trim().replace(/\/+$/, '');
      if (cleanBase.endsWith(`/${this.bucketName}`)) {
        return `${cleanBase}/${objectName}`;
      }
      return `${cleanBase}/${this.bucketName}/${objectName}`;
    }

    const endPoint = this.configService.get<string>(
      'MINIO_ENDPOINT',
      'localhost',
    );

    const port = Number(this.configService.get<number>('MINIO_PORT', 9000));

    const useSSL = this.configService.get<boolean>('MINIO_USE_SSL', false);

    const protocol = useSSL ? 'https' : 'http';

    if (port === 80 || port === 443) {
      return `${protocol}://${endPoint}/${this.bucketName}/${objectName}`;
    }

    return `${protocol}://${endPoint}:${port}/${this.bucketName}/${objectName}`;
  }

  isPublicFolder(folder: string): boolean {
    return (PUBLIC_MEDIA_FOLDERS as readonly string[]).includes(folder);
  }

  async getPresignedUrl(
    objectName: string,
    expirySeconds = 3600,
  ): Promise<string> {
    if (this.demoMode) {
      return objectName;
    }
    return this.getMinioClient().presignedGetObject(
      this.bucketName,
      objectName,
      expirySeconds,
    );
  }

  private createMinioClient(): Client {
    return new Client({
      endPoint: this.configService.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: Number(this.configService.get<number>('MINIO_PORT', 9000)),
      useSSL: this.configService.get<boolean>('MINIO_USE_SSL', false),
      accessKey: this.configService.get<string>(
        'MINIO_ACCESS_KEY',
        'minioadmin',
      ),
      secretKey: this.configService.get<string>(
        'MINIO_SECRET_KEY',
        'minioadmin',
      ),
    });
  }

  private getMinioClient(): Client {
    if (!this.minioClient) {
      this.minioClient = this.createMinioClient();
    }
    return this.minioClient;
  }
}
