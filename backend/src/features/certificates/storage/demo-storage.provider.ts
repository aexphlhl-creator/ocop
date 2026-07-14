import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { StorageProvider, StoredFile } from './storage-provider.interface';

@Injectable()
export class DemoStorageProvider implements StorageProvider {
  private readonly logger = new Logger(DemoStorageProvider.name);

  async upload(_file: Express.Multer.File, _folder: string): Promise<StoredFile> {
    this.logger.warn('[DemoStorageProvider] DEMO_MODE=true -> Skip MinIO upload');
    throw new BadRequestException('Certificate file upload is disabled in demo mode.');
  }

  async getDownloadUrl(fileUrl: string): Promise<string> {
    this.logger.log('[DemoStorageProvider] DEMO_MODE=true -> Skip MinIO presigned URL generation');
    return fileUrl;
  }
}
