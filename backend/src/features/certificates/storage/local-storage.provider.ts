import {
  Injectable,
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { extname, join } from 'path';
import { StorageProvider, StoredFile } from './storage-provider.interface';
import { matchesUploadedFileSignature } from '../../../common/utils/uploaded-file-signature';

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
      throw new BadRequestException(
        'Định dạng file chứng nhận không được hỗ trợ',
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

    if (!/^[a-zA-Z0-9_-]+$/.test(folder)) {
      throw new BadRequestException('Thư mục tải lên không hợp lệ');
    }
    const uploadDir = join(process.cwd(), 'assets', 'uploads', folder);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- folder is a single validated path segment beneath assets/uploads.
    await fs.mkdir(uploadDir, { recursive: true });

    const extension = this.normalizeExtension(file.originalname, file.mimetype);
    const storedName = `${randomUUID()}${extension}`;
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- filename is a generated UUID and extension is allowlisted.
    await fs.writeFile(join(uploadDir, storedName), file.buffer);

    return {
      fileName: file.originalname,
      fileUrl: `/assets/uploads/${folder}/${storedName}`,
      mimeType: file.mimetype,
      fileSize: file.size,
      documentHash: createHash('sha256').update(file.buffer).digest('hex'),
    };
  }

  getDownloadUrl(fileUrl: string): Promise<string> {
    return Promise.resolve(fileUrl);
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
