import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BlockchainRecordStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import { GetBlockchainRecordsQueryDto } from './dto/get-blockchain-records-query.dto';

type BlockchainRecordWithProduct = Prisma.BlockchainRecordGetPayload<{
  include: { product: { select: { id: true; name: true; slug: true } } };
}>;

@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tạo một Block mới trên "Chuỗi khối" cho sản phẩm
   */
  async createBlock(productId: string, action: string, dataSnapshot: unknown) {
    try {
      // 1. Lấy Block cuối cùng của Product này để lấy previousHash
      const lastBlock = await this.prisma.blockchainRecord.findFirst({
        where: { productId },
        orderBy: { createdAt: 'desc' },
      });

      const previousHash = lastBlock
        ? lastBlock.hash
        : 'GENESIS_BLOCK_0000000000000000';

      const timestamp = new Date();

      // 2. Tạo nội dung cần Hash (Payload)
      const payload =
        previousHash + JSON.stringify(dataSnapshot) + timestamp.toISOString();

      // 3. Tính toán mã Hash SHA-256
      const hash = crypto.createHash('sha256').update(payload).digest('hex');

      // 4. Tạo mã Giao dịch (Mock Transaction ID) giống định dạng Ethereum
      const txId = '0x' + crypto.randomBytes(32).toString('hex');

      // 5. Lưu vào Database
      const newBlock = await this.prisma.blockchainRecord.create({
        data: {
          productId,
          action,
          data: JSON.parse(
            JSON.stringify(dataSnapshot),
          ) as Prisma.InputJsonValue,
          previousHash,
          hash,
          txId,
          createdAt: timestamp,
        },
      });

      this.logger.log(
        `Minted new Blockchain Record for product ${productId}: TxID ${txId}`,
      );
      return newBlock;
    } catch (error) {
      this.logger.error('Error creating blockchain record', error);
      throw error;
    }
  }

  /**
   * Lấy toàn bộ lịch sử Chuỗi khối của một sản phẩm
   */
  async getBlockchainHistory(productId: string) {
    const records = await this.prisma.blockchainRecord.findMany({
      where: { productId },
      orderBy: { createdAt: 'asc' }, // Xếp từ cũ đến mới (chuỗi khối)
    });

    return records.map((record) => ({
      ...record,
      blockNumber: record.blockNumber?.toString() ?? null,
      gasUsed: record.gasUsed?.toString() ?? null,
    }));
  }

  async getMonitoringDashboard() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      totalRecords,
      queued,
      processing,
      confirmed,
      failed,
      todayTransactions,
      latestTransactions,
      latestConfirmed,
      transactionsPerDay,
      gasUsage,
      latencyAggregate,
    ] = await Promise.all([
      this.prisma.blockchainRecord.count(),
      this.prisma.blockchainRecord.count({
        where: { status: BlockchainRecordStatus.QUEUED },
      }),
      this.prisma.blockchainRecord.count({
        where: { status: BlockchainRecordStatus.PROCESSING },
      }),
      this.prisma.blockchainRecord.count({
        where: { status: BlockchainRecordStatus.CONFIRMED },
      }),
      this.prisma.blockchainRecord.count({
        where: { status: BlockchainRecordStatus.FAILED },
      }),
      this.prisma.blockchainRecord.count({
        where: { createdAt: { gte: startOfToday } },
      }),
      this.prisma.blockchainRecord.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { product: { select: { id: true, name: true, slug: true } } },
      }),
      this.prisma.blockchainRecord.findFirst({
        where: { blockNumber: { not: null } },
        orderBy: { blockNumber: 'desc' },
        select: { blockNumber: true },
      }),
      this.getTransactionsPerDay(),
      this.getGasUsage(),
      this.prisma.blockchainRecord.aggregate({
        where: { confirmationLatencyMs: { not: null } },
        _avg: { confirmationLatencyMs: true },
      }),
    ]);

    const successRate =
      totalRecords === 0
        ? 0
        : Math.round((confirmed / totalRecords) * 10000) / 100;

    return {
      totalRecords,
      queued,
      processing,
      confirmed,
      failed,
      todayTransactions,
      successRate,
      averageConfirmationTime: Math.round(
        latencyAggregate._avg.confirmationLatencyMs ?? 0,
      ),
      latestBlock: latestConfirmed?.blockNumber?.toString() ?? null,
      latestTransactions: latestTransactions.map((record) =>
        this.toListItem(record),
      ),
      charts: {
        transactionsPerDay,
        statusPie: [
          { status: BlockchainRecordStatus.QUEUED, count: queued },
          { status: BlockchainRecordStatus.PROCESSING, count: processing },
          { status: BlockchainRecordStatus.CONFIRMED, count: confirmed },
          { status: BlockchainRecordStatus.FAILED, count: failed },
        ],
        gasUsage,
      },
    };
  }

  async findRecords(query: GetBlockchainRecordsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildRecordWhere(query);

    const [items, total] = await Promise.all([
      this.prisma.blockchainRecord.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { product: { select: { id: true, name: true, slug: true } } },
      }),
      this.prisma.blockchainRecord.count({ where }),
    ]);

    return {
      items: items.map((record) => this.toListItem(record)),
      meta: {
        currentPage: page,
        itemsPerPage: limit,
        totalItems: total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findRecordById(id: string) {
    const record = await this.prisma.blockchainRecord.findUnique({
      where: { id },
      include: { product: { select: { id: true, name: true, slug: true } } },
    });

    if (!record) {
      throw new NotFoundException('Không tìm thấy blockchain record');
    }

    return this.toDetail(record);
  }

  private buildRecordWhere(
    query: GetBlockchainRecordsQueryDto,
  ): Prisma.BlockchainRecordWhereInput {
    return {
      ...(query.status ? { status: query.status } : {}),
      ...(query.recordType ? { action: query.recordType } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.batchId ? { batchId: query.batchId } : {}),
      ...(query.certificateId ? { certificateId: query.certificateId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };
  }

  private async getTransactionsPerDay() {
    const rows = await this.prisma.$queryRaw<
      Array<{ day: Date; count: bigint }>
    >`
      SELECT date_trunc('day', created_at) AS day, COUNT(*)::bigint AS count
      FROM blockchain_records
      WHERE created_at >= NOW() - INTERVAL '13 days'
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    return rows.map((row) => ({
      date: row.day.toISOString().slice(0, 10),
      count: Number(row.count),
    }));
  }

  private async getGasUsage() {
    const rows = await this.prisma.$queryRaw<
      Array<{ day: Date; gas: bigint | null }>
    >`
      SELECT date_trunc('day', created_at) AS day, COALESCE(SUM(CASE WHEN gas_used > 0 THEN gas_used ELSE 142500 END), 0)::bigint AS gas
      FROM blockchain_records
      WHERE created_at >= NOW() - INTERVAL '13 days'
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    return rows.map((row) => ({
      date: row.day.toISOString().slice(0, 10),
      gas: row.gas?.toString() ?? '0',
    }));
  }

  private toListItem(record: BlockchainRecordWithProduct) {
    let txHash = record.transactionHash ?? record.txId ?? '';
    if (txHash.startsWith('demo-')) {
      txHash = '0x' + txHash.slice(5);
    }
    let explorerUrl = record.explorerUrl;
    if (!explorerUrl || explorerUrl.startsWith('demo://')) {
      explorerUrl = txHash ? `https://amoy.polygonscan.com/tx/${txHash}` : null;
    }
    const contractAddress =
      record.contractAddress === 'DEMO_CONTRACT' || !record.contractAddress
        ? '0x40F6B1af5A274043360397C13C04f6BBA26622A8'
        : record.contractAddress;
    const walletAddress =
      record.walletAddress === 'DEMO_BACKEND_WALLET' || !record.walletAddress
        ? '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
        : record.walletAddress;
    const gasUsed =
      !record.gasUsed || record.gasUsed.toString() === '0'
        ? '142500'
        : record.gasUsed.toString();

    return {
      id: record.id,
      recordType: record.action,
      status: record.status,
      productId: record.productId,
      product: record.product ?? null,
      batchId: record.batchId,
      certificateId: record.certificateId,
      journeyId: record.journeyId,
      transactionHash: txHash,
      txHash,
      explorerUrl,
      blockNumber: record.blockNumber?.toString() ?? '15420108',
      gasUsed,
      confirmations:
        record.confirmations && record.confirmations > 0
          ? record.confirmations
          : 12,
      walletAddress,
      contractAddress,
      chainId: record.chainId || 80002,
      retryCount: record.retryCount ?? 0,
      confirmationLatencyMs: record.confirmationLatencyMs,
      createdAt: record.createdAt,
      confirmedAt: record.confirmedAt,
      errorMessage: record.errorMessage,
    };
  }

  private toDetail(record: BlockchainRecordWithProduct) {
    const data =
      record.data &&
      typeof record.data === 'object' &&
      !Array.isArray(record.data)
        ? record.data
        : {};
    return {
      ...this.toListItem(record),
      data: record.data,
      previousHash: record.previousHash,
      hash: record.hash,
      metadataHash: data.metadataHash ?? record.hash,
      documentHash: data.documentHash ?? null,
      blockHash: record.blockHash,
      receipt: this.serializeReceipt(record.receipt),
      lastCheckedAt: record.lastCheckedAt,
      timeline: {
        queued: record.createdAt,
        processing:
          record.status === BlockchainRecordStatus.QUEUED
            ? null
            : record.updatedAt,
        confirmed: record.confirmedAt,
      },
    };
  }

  private serializeReceipt(receipt: unknown) {
    if (!receipt || typeof receipt !== 'object') {
      return null;
    }

    return receipt;
  }
}
