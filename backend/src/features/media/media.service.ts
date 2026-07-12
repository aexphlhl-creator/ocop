import { Injectable, OnModuleInit, BadRequestException, UnsupportedMediaTypeException, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';

@Injectable()
export class MediaService implements OnModuleInit {
  private minioClient: Client;
  private bucketName: string;

  constructor(private readonly configService: ConfigService) {
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
    try {
      const bucketExists = await this.minioClient.bucketExists(this.bucketName);
      if (!bucketExists) {
        await this.minioClient.makeBucket(this.bucketName, 'us-east-1');
        // Tạo chính sách công cộng để người dùng có thể xem ảnh qua URL trực tiếp
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
        await this.minioClient.setBucketPolicy(this.bucketName, JSON.stringify(policy));
      }
    } catch (err) {
      console.error('Lỗi khi cấu hình bucket MinIO:', err);
    }
  }

  async uploadImage(file: Express.Multer.File, folder: string = 'products') {
    // 1. Kiểm tra sự tồn tại của file
    if (!file) {
      throw new BadRequestException('Không tìm thấy file tải lên');
    }

    // 2. Validate Mime type (415 Unsupported Media Type)
    const allowedMimeTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new UnsupportedMediaTypeException('Chỉ cho phép tải lên định dạng: jpg, jpeg, png, webp, pdf, doc, docx');
    }

    // 2.5. Validate Extension strictly to prevent MIME spoofing
    const fileExt = (file.originalname.split('.').pop() || '').toLowerCase();
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'doc', 'docx'];
    if (!allowedExtensions.includes(fileExt)) {
      throw new UnsupportedMediaTypeException(`Đuôi file .${fileExt} không được phép`);
    }

    // 3. Validate size (413 Payload Too Large - 10MB)
    const maxSizeBytes = 10 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      throw new PayloadTooLargeException('Kích thước file vượt quá giới hạn cho phép (10MB)');
    }

    // 4. Tạo Object Name ngẫu nhiên tránh trùng lặp
    const randomName = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const objectName = `${folder}/${randomName}.${fileExt}`;

    // 5. Đẩy dữ liệu lên MinIO
    await this.minioClient.putObject(
      this.bucketName,
      objectName,
      file.buffer,
      file.size,
      { 'Content-Type': file.mimetype }
    );

    const url = this.generatePublicUrl(objectName);

    return {
      url,
      objectName,
      size: file.size,
      mimeType: file.mimetype,
    };
  }

  async deleteImage(objectName: string): Promise<void> {
    if (!objectName) {
      throw new BadRequestException('Bắt buộc phải có objectName để xóa');
    }
    try {
      await this.minioClient.removeObject(this.bucketName, objectName);
    } catch (err) {
      throw new BadRequestException(`Không thể xóa object "${objectName}" khỏi MinIO: ${err.message}`);
    }
  }

  generatePublicUrl(objectName: string): string {
    const endPoint = this.configService.get<string>('MINIO_ENDPOINT', 'localhost');
    const port = this.configService.get<number>('MINIO_PORT', 9000);
    const useSSL = this.configService.get<boolean>('MINIO_USE_SSL', false);
    const protocol = useSSL ? 'https' : 'http';

    if (port === 80 || port === 443) {
      return `${protocol}://${endPoint}/${this.bucketName}/${objectName}`;
    }
    return `${protocol}://${endPoint}:${port}/${this.bucketName}/${objectName}`;
  }
}
