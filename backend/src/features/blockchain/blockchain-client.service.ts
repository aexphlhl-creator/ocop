import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Contract,
  InterfaceAbi,
  JsonRpcProvider,
  TransactionReceipt,
  Wallet,
  ZeroHash,
} from 'ethers';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

export interface RecordTraceabilityInput {
  productId: string;
  batchId?: string | null;
  metadataHash: string;
  documentHash?: string | null;
  action: string;
  knownTxHash?: string | null;
}

export interface BlockchainTransactionResult {
  transactionHash: string;
  blockHash: string | null;
  blockNumber: bigint | null;
  gasUsed: bigint;
  walletAddress: string;
  contractAddress: string;
  chainId: number;
  explorerUrl: string;
  confirmations: number;
  confirmedAt: Date;
  receipt: Record<string, unknown>;
  status?: number | null;
}

@Injectable()
export class BlockchainClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BlockchainClientService.name);
  private provider: JsonRpcProvider | null = null;
  private wallet: Wallet | null = null;
  private contract: Contract | null = null;
  private abi: InterfaceAbi | null = null;
  private readonly mockOnChainLedger = new Map<string, BlockchainTransactionResult>();

  constructor(private readonly configService: ConfigService) {}

  onModuleDestroy() {
    if (this.provider && typeof (this.provider as any).destroy === 'function') {
      try {
        (this.provider as any).destroy();
      } catch {
        // ignore
      }
    }
  }

  onModuleInit() {
    if (this.isDemoMode()) {
      this.logger.warn(
        'DEMO_MODE enabled: external blockchain submission is disabled.',
      );
      return;
    }

    if (!this.hasBlockchainConfig()) {
      this.logger.warn('Blockchain chưa được cấu hình');
      return;
    }

    this.abi = this.loadAbi();
    this.provider = new JsonRpcProvider(
      this.configService.get<string>('POLYGON_RPC_URL'),
      this.configService.get<number>('POLYGON_CHAIN_ID', 80002),
    );
    this.wallet = new Wallet(
      this.configService.get<string>('POLYGON_PRIVATE_KEY', ''),
      this.provider,
    );
    this.contract = new Contract(
      this.configService.get<string>('CONTRACT_ADDRESS', ''),
      this.abi,
      this.wallet,
    );

    this.logger.log('Polygon Amoy blockchain client initialized.');
  }

  isConfigured() {
    return Boolean(this.provider && this.wallet && this.contract && this.abi);
  }

  getProvider() {
    return this.provider;
  }

  getWalletAddress() {
    return this.wallet?.address ?? null;
  }

  getContract() {
    return this.contract;
  }

  getContractAddress() {
    return this.configService.get<string>('CONTRACT_ADDRESS', '');
  }

  getChainId() {
    return this.configService.get<number>('POLYGON_CHAIN_ID', 80002);
  }

  async recordTraceability(
    input: RecordTraceabilityInput,
    onBroadcast?: (txHash: string) => Promise<void>,
  ): Promise<BlockchainTransactionResult> {
    if (this.isDemoMode()) {
      return this.recordMockTraceability(input);
    }

    if (!this.contract || !this.wallet) {
      throw new Error('Blockchain chưa được cấu hình');
    }

    const metadataHash = this.normalizeBytes32(
      input.metadataHash,
      'metadataHash',
    );
    const documentHash = input.documentHash
      ? this.normalizeBytes32(input.documentHash, 'documentHash')
      : ZeroHash;
    const batchId = input.batchId ?? '';

    try {
      const tx = await this.contract
        .getFunction('recordTraceability')
        .send(input.productId, batchId, metadataHash, documentHash, input.action);
      this.logger.log(`Transaction Sent: hash=${tx.hash} action=${input.action}`);

      // Immediately notify worker of broadcast txHash before awaiting confirmation
      if (onBroadcast) {
        await onBroadcast(tx.hash);
      }

      let receipt: TransactionReceipt | null = null;
      try {
        receipt = await tx.wait(1);
      } catch (waitErr: any) {
        receipt =
          waitErr?.receipt ??
          (this.provider
            ? await this.provider.getTransactionReceipt(tx.hash)
            : null);
      }

      if (!receipt) {
        throw new Error(`Transaction receipt not available: ${tx.hash}`);
      }

      if (receipt.status === 0) {
        throw new Error(
          `TRANSACTION_REVERTED_ON_CHAIN: Transaction ${receipt.hash} reverted on-chain (status === 0).`,
        );
      }

      const confirmations = await this.getConfirmations(receipt);
      const contractAddress = this.getContractAddress();

      this.logger.log(
        `Transaction Confirmed: hash=${receipt.hash} block=${receipt.blockNumber}`,
      );

      return {
        transactionHash: receipt.hash,
        blockHash: receipt.blockHash,
        blockNumber:
          receipt.blockNumber === null ? null : BigInt(receipt.blockNumber),
        gasUsed: receipt.gasUsed,
        walletAddress: this.wallet.address,
        contractAddress,
        chainId: this.getChainId(),
        explorerUrl: `https://amoy.polygonscan.com/tx/${receipt.hash}`,
        confirmations,
        confirmedAt: new Date(),
        receipt: this.sanitizeReceipt(receipt, confirmations),
        status: receipt.status !== null && receipt.status !== undefined ? Number(receipt.status) : 1,
      };
    } catch (err: any) {
      // Contract-enforced idempotency check: DuplicateRecord
      if (
        err?.message?.includes('DuplicateRecord') ||
        err?.data?.includes?.('DuplicateRecord')
      ) {
        this.logger.warn(
          `Contract rejected duplicate broadcast via DuplicateRecord. Recovering authentic record from on-chain state.`,
        );
        const existing = await this.findOnChainRecord(input);
        if (existing) {
          return existing;
        }
      }
      throw err;
    }
  }

  async findOnChainRecord(
    input: RecordTraceabilityInput,
  ): Promise<BlockchainTransactionResult | null> {
    const key = `${input.productId}:${input.batchId ?? ''}:${input.action}:${input.metadataHash}:${input.documentHash ?? ''}`;
    if (this.isDemoMode()) {
      return this.mockOnChainLedger.get(key) ?? null;
    }

    if (!this.contract) {
      return null;
    }

    try {
      // 1. If knownTxHash is provided, verify whether it is already mined or pending in mempool
      if (input.knownTxHash && this.provider) {
        try {
          const tx = await this.provider.getTransaction(input.knownTxHash);
          if (tx) {
            if (tx.blockNumber != null) {
              const receipt = await this.provider.getTransactionReceipt(
                input.knownTxHash,
              );
              if (receipt) {
                const confirmations = await this.getConfirmations(receipt);
                const receiptStatus =
                  receipt.status !== null && receipt.status !== undefined
                    ? Number(receipt.status)
                    : null;
                if (receiptStatus === 0) {
                  this.logger.warn(
                    `Inspected knownTxHash ${input.knownTxHash} was reverted on-chain (receipt.status === 0).`,
                  );
                }
                return {
                  transactionHash: receipt.hash,
                  blockHash: receipt.blockHash,
                  blockNumber: BigInt(receipt.blockNumber),
                  gasUsed: receipt.gasUsed,
                  walletAddress: tx.from,
                  contractAddress: this.getContractAddress(),
                  chainId: this.getChainId(),
                  explorerUrl: `https://amoy.polygonscan.com/tx/${receipt.hash}`,
                  confirmations,
                  confirmedAt: new Date(),
                  receipt: this.sanitizeReceipt(receipt, confirmations),
                  status: receiptStatus,
                };
              }
            } else {
              // Transaction is still pending in mempool! Wait for receipt
              this.logger.log(
                `Transaction ${input.knownTxHash} is pending in mempool. Waiting for confirmation...`,
              );
              let receipt: TransactionReceipt | null = null;
              try {
                receipt = await tx.wait(1);
              } catch (waitErr: any) {
                receipt =
                  waitErr?.receipt ??
                  (await this.provider.getTransactionReceipt(input.knownTxHash));
              }
              if (receipt) {
                const confirmations = await this.getConfirmations(receipt);
                const receiptStatus =
                  receipt.status !== null && receipt.status !== undefined
                    ? Number(receipt.status)
                    : null;
                if (receiptStatus === 0) {
                  this.logger.warn(
                    `Pending knownTxHash ${input.knownTxHash} resolved to reverted (receipt.status === 0).`,
                  );
                }
                return {
                  transactionHash: receipt.hash,
                  blockHash: receipt.blockHash,
                  blockNumber: BigInt(receipt.blockNumber),
                  gasUsed: receipt.gasUsed,
                  walletAddress: tx.from,
                  contractAddress: this.getContractAddress(),
                  chainId: this.getChainId(),
                  explorerUrl: `https://amoy.polygonscan.com/tx/${receipt.hash}`,
                  confirmations,
                  confirmedAt: new Date(),
                  receipt: this.sanitizeReceipt(receipt, confirmations),
                  status: receiptStatus,
                };
              }
            }
          }
        } catch (txErr) {
          this.logger.warn(
            `Failed to inspect knownTxHash ${input.knownTxHash}: ${(txErr as Error).message}`,
          );
        }
      }

      const normalizedMetaHash = this.normalizeBytes32(
        input.metadataHash,
        'metadataHash',
      ).toLowerCase();

      const expectedDocHash = input.documentHash
        ? this.normalizeBytes32(input.documentHash, 'documentHash').toLowerCase()
        : ZeroHash.toLowerCase();

      // 2. Check contract-enforced state: hasRecord & getRecordBlockNumber (Infinite history O(1) check)
      let isRecordedOnChain = false;
      let targetBlock: number | null = null;
      if (typeof (this.contract as any).hasRecord === 'function') {
        try {
          isRecordedOnChain = await (this.contract as any).hasRecord(
            input.productId,
            input.batchId ?? '',
            input.action,
            normalizedMetaHash,
            expectedDocHash,
          );
          if (isRecordedOnChain && typeof (this.contract as any).getRecordBlockNumber === 'function') {
            const blockNum = await (this.contract as any).getRecordBlockNumber(
              input.productId,
              input.batchId ?? '',
              input.action,
              normalizedMetaHash,
              expectedDocHash,
            );
            if (blockNum && Number(blockNum) > 0) {
              targetBlock = Number(blockNum);
            }
          }
        } catch (viewErr) {
          this.logger.warn(
            `Contract hasRecord view check failed: ${(viewErr as Error).message}`,
          );
        }
      }

      // TraceabilityRecorded event from TraceabilityRegistry.sol
      const filter = this.contract.filters.TraceabilityRecorded();
      let fromBlock: number;
      let toBlock: number | undefined;

      if (targetBlock !== null) {
        // Query exact block where record was mined (immune to 10,000 block window)
        fromBlock = targetBlock;
        toBlock = targetBlock;
      } else {
        // Fallback: recent block scan depth
        let currentBlock = 0;
        if (this.provider) {
          try {
            currentBlock = await this.provider.getBlockNumber();
            const configuredDepth = this.configService.get<number>(
              'BLOCKCHAIN_SCAN_DEPTH',
              10000,
            );
            fromBlock = Math.max(0, currentBlock - configuredDepth);
          } catch (blockErr) {
            throw new Error(
              `Unable to determine current block number: ${(blockErr as Error).message}`,
            );
          }
        } else {
          fromBlock = 0;
        }
      }

      const events = await this.contract.queryFilter(filter, fromBlock, toBlock);

      for (const event of events) {
        const parsed =
          'args' in event && event.args
            ? event.args
            : (this.contract.interface.parseLog(event)?.args as any);

        if (!parsed) continue;

        const eventProductId = parsed.productId;
        const eventBatchId = parsed.batchId ?? '';
        const eventAction = parsed.action;
        const eventMetaHash = parsed.metadataHash;
        const eventDocHash = parsed.documentHash ?? ZeroHash;

        // Directive 1: Match all 5 fields: productId, batchId, action, metadataHash, documentHash
        const matchesProduct = eventProductId === input.productId;
        const matchesBatch = (eventBatchId || '') === (input.batchId || '');
        const matchesAction = eventAction === input.action;
        const matchesMeta =
          typeof eventMetaHash === 'string' &&
          this.normalizeBytes32(eventMetaHash, 'metadataHash').toLowerCase() ===
            normalizedMetaHash;
        const matchesDoc =
          typeof eventDocHash === 'string' &&
          this.normalizeBytes32(eventDocHash, 'documentHash').toLowerCase() ===
            expectedDocHash;

        if (
          matchesProduct &&
          matchesBatch &&
          matchesAction &&
          matchesMeta &&
          matchesDoc
        ) {
          const receipt =
            (await event.getTransactionReceipt?.()) ??
            (this.provider
              ? await this.provider.getTransactionReceipt(event.transactionHash)
              : null);

          const confirmations = receipt
            ? await this.getConfirmations(receipt)
            : 1;

          return {
            transactionHash: event.transactionHash,
            blockHash: event.blockHash,
            blockNumber: event.blockNumber ? BigInt(event.blockNumber) : null,
            gasUsed: receipt ? BigInt(receipt.gasUsed) : BigInt(0),
            walletAddress:
              parsed.recorder || receipt?.from || this.wallet?.address || '',
            contractAddress: this.getContractAddress(),
            chainId: this.getChainId(),
            explorerUrl: `https://amoy.polygonscan.com/tx/${event.transactionHash}`,
            confirmations,
            confirmedAt: new Date(),
            receipt: receipt
              ? this.sanitizeReceipt(receipt, confirmations)
              : {
                  transactionHash: event.transactionHash,
                  recoveredFromEventLog: true,
                  status: 1,
                },
            status:
              receipt && receipt.status !== null && receipt.status !== undefined
                ? Number(receipt.status)
                : 1,
          };
        }
      }

      // If record is known on chain via contract state, but event log not found in scan:
      if (isRecordedOnChain) {
        throw new Error(
          `RPC_QUERY_FAILED: Record is verified on-chain via contract state, but event log is currently not retrievable. Retaining uncertain state.`,
        );
      }

      // Check whether wallet has pending transactions in mempool
      // "Không coi 'không tìm thấy event trong phạm vi quét' là bằng chứng chưa broadcast"
      if (
        this.wallet &&
        typeof (this.wallet as any).getNonce === 'function' &&
        this.provider
      ) {
        const latestNonce = await this.wallet.getNonce('latest');
        const pendingNonce = await this.wallet.getNonce('pending');
        if (pendingNonce > latestNonce) {
          this.logger.warn(
            `Wallet has pending transaction in mempool (pending: ${pendingNonce} > latest: ${latestNonce}). Retaining uncertain state.`,
          );
          throw new Error(
            `PENDING_MEMPOOL_TRANSACTION: Wallet has ${pendingNonce - latestNonce} pending transaction(s) in mempool. Cannot confirm absence of prior broadcast.`,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `Failed to inspect on-chain records due to RPC error: ${(err as Error).message}`,
      );
      // Propagate RPC error so caller preserves uncertain state and never duplicates transaction
      throw new Error(`RPC_QUERY_FAILED: ${(err as Error).message}`);
    }

    return null;
  }

  private hasBlockchainConfig() {
    return Boolean(
      this.configService.get<string>('POLYGON_RPC_URL') &&
      this.configService.get<string>('POLYGON_PRIVATE_KEY') &&
      this.configService.get<string>('CONTRACT_ADDRESS'),
    );
  }

  private isDemoMode() {
    return this.configService.get<boolean>('DEMO_MODE', false) === true;
  }

  private recordMockTraceability(
    input: RecordTraceabilityInput,
  ): BlockchainTransactionResult {
    const confirmedAt = new Date();
    const hex = createHash('sha256')
      .update(
        `${input.productId}:${input.batchId ?? ''}:${input.action}:${confirmedAt.toISOString()}`,
      )
      .digest('hex');
    const mockHash = `0x${hex}`;
    const contractAddress = this.configService.get<string>(
      'CONTRACT_ADDRESS',
      '0x40F6B1af5A274043360397C13C04f6BBA26622A8',
    );
    const walletAddress =
      this.wallet?.address || '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
    const blockNumber = BigInt(15420000 + Math.floor(Math.random() * 50000));
    const blockHash = `0x${createHash('sha256').update(`block:${blockNumber}`).digest('hex')}`;
    const gasUsed = BigInt(138500 + Math.floor(Math.random() * 15000));

    this.logger.log(
      `Blockchain Verified: hash=${mockHash} action=${input.action}`,
    );

    const result: BlockchainTransactionResult = {
      transactionHash: mockHash,
      blockHash,
      blockNumber,
      gasUsed,
      walletAddress,
      contractAddress,
      chainId: this.getChainId(),
      explorerUrl: `https://amoy.polygonscan.com/tx/${mockHash}`,
      confirmations: 12,
      confirmedAt,
      receipt: {
        hash: mockHash,
        status: 'SUCCESS',
        confirmations: 12,
        network: 'Polygon Amoy',
        blockNumber: Number(blockNumber),
        gasUsed: Number(gasUsed),
      },
    };
    const key = `${input.productId}:${input.batchId ?? ''}:${input.action}:${input.metadataHash}:${input.documentHash ?? ''}`;
    this.mockOnChainLedger.set(key, result);
    return result;
  }

  private loadAbi(): InterfaceAbi {
    const candidatePaths = [
      join(__dirname, 'abi', 'TraceabilityRegistry.json'),
      join(
        process.cwd(),
        'src',
        'features',
        'blockchain',
        'abi',
        'TraceabilityRegistry.json',
      ),
    ];

    for (const abiPath of candidatePaths) {
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- candidates are fixed application ABI paths, never request input.
        const parsed = JSON.parse(readFileSync(abiPath, 'utf8'));
        return (Array.isArray(parsed) ? parsed : parsed.abi) as InterfaceAbi;
      } catch {
        continue;
      }
    }

    throw new Error('TraceabilityRegistry ABI not found');
  }

  private normalizeBytes32(value: string, fieldName: string) {
    const normalized = value.startsWith('0x') ? value : `0x${value}`;
    if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
      throw new Error(`${fieldName} must be a bytes32 hex string`);
    }

    return normalized;
  }

  private async getConfirmations(receipt: TransactionReceipt) {
    try {
      return await receipt.confirmations();
    } catch {
      return 1;
    }
  }

  private sanitizeReceipt(
    receipt: TransactionReceipt,
    confirmations: number,
  ): Record<string, unknown> {
    return {
      hash: receipt.hash,
      blockHash: receipt.blockHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      status: receipt.status,
      from: receipt.from,
      to: receipt.to,
      confirmations,
    };
  }
}
