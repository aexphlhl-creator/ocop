import { Injectable, BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { extname, join } from 'path';
import { StorageProvider, StoredFile } from './storage-provider.interface';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly maxSizeBytes = 20 * 1024 * 1024;
  private readonly allowedMimeTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
  ];

  async upload(file: Express.Multer.File, folder: string): Promise<StoredFile> {
    if (!file) {
      throw new BadRequestException('Không tìm thấy file tải lên');
    }
    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Định dạng file chứng nhận không được hỗ trợ');
    }
    if (file.size > this.maxSizeBytes) {
      throw new PayloadTooLargeException('Kích thước file vượt quá giới hạn cho phép (20MB)');
    }

    const uploadDir = join(process.cwd(), 'assets', 'uploads', folder);
    await fs.mkdir(uploadDir, { recursive: true });

    const extension = this.normalizeExtension(file.originalname, file.mimetype);
    const storedName = `${randomUUID()}${extension}`;
    await fs.writeFile(join(uploadDir, storedName), file.buffer);

    return {
      fileName: file.originalname,
      fileUrl: `/assets/uploads/${folder}/${storedName}`,
      mimeType: file.mimetype,
      fileSize: file.size,
      documentHash: createHash('sha256').update(file.buffer).digest('hex'),
    };
  }

  async getDownloadUrl(fileUrl: string): Promise<string> {
    return fileUrl;
  }

  private normalizeExtension(originalName: string, mimeType: string) {
    const extension = extname(originalName).toLowerCase();
    if (['.pdf', '.png', '.jpg', '.jpeg'].includes(extension)) {
      return extension;
    }
    if (mimeType === 'application/pdf') return '.pdf';
    if (mimeType === 'image/png') return '.png';
    return '.jpg';
  }
}
