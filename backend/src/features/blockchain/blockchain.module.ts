import { Module } from '@nestjs/common';
import { BlockchainQueueModule } from '../blockchain-queue/blockchain-queue.module';
import { BlockchainService } from './blockchain.service';
import { BlockchainController } from './blockchain.controller';
import { BlockchainVerificationService } from './blockchain-verification.service';

@Module({
  imports: [BlockchainQueueModule],
  controllers: [BlockchainController],
  providers: [BlockchainService, BlockchainVerificationService],
  exports: [BlockchainService, BlockchainQueueModule],
})
export class BlockchainModule {}
