import { Module } from '@nestjs/common';
import { SupplyChainController } from './supply-chain.controller';
import { SupplyChainService } from './supply-chain.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BlockchainQueueModule } from '../blockchain-queue/blockchain-queue.module';

@Module({
  imports: [PrismaModule, BlockchainQueueModule],
  controllers: [SupplyChainController],
  providers: [SupplyChainService],
  exports: [SupplyChainService],
})
export class SupplyChainModule {}
