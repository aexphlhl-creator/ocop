import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlockchainQueueModule } from '../blockchain-queue/blockchain-queue.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CertificatesController } from './certificates.controller';
import { CertificatesRepository } from './certificates.repository';
import { CertificatesService } from './certificates.service';
import { DemoStorageProvider } from './storage/demo-storage.provider';
import { MinioStorageProvider } from './storage/minio-storage.provider';
import { STORAGE_PROVIDER } from './storage/storage-provider.interface';

const storageLogger = new Logger('CertificatesStorageProvider');

@Module({
  imports: [PrismaModule, BlockchainQueueModule],
  controllers: [CertificatesController],
  providers: [
    CertificatesService,
    CertificatesRepository,
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const demoMode = configService.get<boolean>('DEMO_MODE', false);
        if (demoMode) {
          storageLogger.log(
            '[CertificatesStorageProvider] DEMO_MODE=true -> Skip MinIO provider initialization',
          );
          return new DemoStorageProvider();
        }

        const provider = new MinioStorageProvider(configService);
        await provider.initialize();
        return provider;
      },
    },
  ],
  exports: [CertificatesService, STORAGE_PROVIDER],
})
export class CertificatesModule {}
