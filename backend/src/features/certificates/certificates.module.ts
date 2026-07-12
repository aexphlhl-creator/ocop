import { Module } from '@nestjs/common';
import { BlockchainQueueModule } from '../blockchain-queue/blockchain-queue.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CertificatesController } from './certificates.controller';
import { CertificatesRepository } from './certificates.repository';
import { CertificatesService } from './certificates.service';
import { LocalStorageProvider } from './storage/local-storage.provider';
import { MinioStorageProvider } from './storage/minio-storage.provider';
import { STORAGE_PROVIDER } from './storage/storage-provider.interface';

@Module({
  imports: [PrismaModule, BlockchainQueueModule],
  controllers: [CertificatesController],
  providers: [
    CertificatesService,
    CertificatesRepository,
    LocalStorageProvider,
    MinioStorageProvider,
    {
      provide: STORAGE_PROVIDER,
      useExisting: MinioStorageProvider,
    },
  ],
  exports: [CertificatesService, STORAGE_PROVIDER],
})
export class CertificatesModule {}
