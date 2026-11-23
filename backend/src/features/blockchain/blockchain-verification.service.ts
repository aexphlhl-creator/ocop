import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BlockchainRecordStatus } from '@prisma/client';
import { BlockchainClientService } from './blockchain-client.service';
import { PrismaService } from '../prisma/prisma.service';

const REQUIRED_CONFIRMATIONS = 1;
const MAX_RECEIPT_RETRIES = 5;

@Injectable()
export class BlockchainVerificationService {
  private readonly logger = new Logger(BlockchainVerificationService.name);
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly blockchainClientService: BlockchainClientService,
  ) {}

  @Cron('*/1 * * * *')
  async verifyPendingTransactions() {
    if (
      this.isRunning ||
      !this.blockchainClientService.isConfigured() ||
      process.env.NODE_ENV === 'test'
    ) {
      return;
    }

    this.isRunning = true;
    try {
      const records = await this.prisma.blockchainRecord.findMany({
        where: {
          transactionHash: { not: null },
          OR: [
            { status: BlockchainRecordStatus.PROCESSING },
            {
              status: BlockchainRecordStatus.CONFIRMED,
              confirmations: { lt: REQUIRED_CONFIRMATIONS },
            },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });

      for (const record of records) {
        await this.verifyRecord(record.id, record.transactionHash as string);
      }
    } catch (error) {
      this.logger.error('Blockchain verification scheduler failed', error);
    } finally {
      this.isRunning = false;
    }
  }

  private async verifyRecord(recordId: string, transactionHash: string) {
    const provider = this.blockchainClientService.getProvider();
    if (!provider) return;

    const record = await this.prisma.blockchainRecord.findUnique({
      where: { id: recordId },
    });
    if (!record) return;

    try {
      const receipt = await provider.getTransactionReceipt(transactionHash);
      if (!receipt) {
        const retryCount = record.retryCount + 1;
        await this.prisma.blockchainRecord.update({
          where: { id: record.id },
          data: {
            retryCount,
            lastCheckedAt: new Date(),
            ...(retryCount >= MAX_RECEIPT_RETRIES
              ? {
                  status: BlockchainRecordStatus.FAILED,
                  errorMessage:
                    'Transaction dropped or receipt not found after verification retries',
                }
              : {}),
          },
        });
        return;
      }

      let confirmations = record.confirmations ?? 1;
      try {
        confirmations = await receipt.confirmations();
      } catch {
        confirmations = Math.max(confirmations, 1);
      }

      const confirmedAt = record.confirmedAt ?? new Date();
      await this.prisma.blockchainRecord.update({
        where: { id: record.id },
        data: {
          blockHash: receipt.blockHash,
          blockNumber:
            receipt.blockNumber === null ? null : BigInt(receipt.blockNumber),
          gasUsed: receipt.gasUsed,
          confirmations,
          confirmedAt,
          confirmationLatencyMs:
            record.confirmationLatencyMs ??
            confirmedAt.getTime() - record.createdAt.getTime(),
          lastCheckedAt: new Date(),
          retryCount: 0,
          status:
            confirmations >= REQUIRED_CONFIRMATIONS
              ? BlockchainRecordStatus.CONFIRMED
              : BlockchainRecordStatus.PROCESSING,
          errorMessage: null,
          receipt: {
            hash: receipt.hash,
            blockHash: receipt.blockHash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString(),
            status: receipt.status,
            from: receipt.from,
            to: receipt.to,
            confirmations,
          },
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown verification error';
      await this.prisma.blockchainRecord.update({
        where: { id: record.id },
        data: {
          retryCount: { increment: 1 },
          lastCheckedAt: new Date(),
          errorMessage: message,
        },
      });
      this.logger.warn(
        `Blockchain verification retry scheduled: record=${record.id} reason=${message}`,
      );
    }
  }
}
