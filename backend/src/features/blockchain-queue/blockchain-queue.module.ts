import { Module } from '@nestjs/common';
import { BlockchainClientService } from '../blockchain/blockchain-client.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BlockchainProcessor } from './blockchain.processor';
import { BlockchainQueueService } from './blockchain-queue.service';

@Module({
  imports: [PrismaModule],
  providers: [BlockchainQueueService, BlockchainProcessor, BlockchainClientService],
  exports: [BlockchainQueueService, BlockchainClientService],
})
export class BlockchainQueueModule {}
