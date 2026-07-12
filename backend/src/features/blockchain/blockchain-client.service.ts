import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Contract, InterfaceAbi, JsonRpcProvider, TransactionReceipt, Wallet, ZeroHash } from 'ethers';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

export interface RecordTraceabilityInput {
  productId: string;
  batchId?: string | null;
  metadataHash: string;
  documentHash?: string | null;
  action: string;
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
}

@Injectable()
export class BlockchainClientService implements OnModuleInit {
  private readonly logger = new Logger(BlockchainClientService.name);
  private provider: JsonRpcProvider | null = null;
  private wallet: Wallet | null = null;
  private contract: Contract | null = null;
  private abi: InterfaceAbi | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    if (this.isDemoMode()) {
      this.logger.warn('DEMO_MODE enabled: external blockchain submission is disabled.');
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
    this.wallet = new Wallet(this.configService.get<string>('POLYGON_PRIVATE_KEY', ''), this.provider);
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

  async recordTraceability(input: RecordTraceabilityInput): Promise<BlockchainTransactionResult> {
    if (this.isDemoMode()) {
      return this.recordMockTraceability(input);
    }

    if (!this.contract || !this.wallet) {
      throw new Error('Blockchain chưa được cấu hình');
    }

    const metadataHash = this.normalizeBytes32(input.metadataHash, 'metadataHash');
    const documentHash = input.documentHash
      ? this.normalizeBytes32(input.documentHash, 'documentHash')
      : ZeroHash;
    const batchId = input.batchId ?? '';

    const tx = await this.contract.recordTraceability(
      input.productId,
      batchId,
      metadataHash,
      documentHash,
      input.action,
    );
    this.logger.log(`Transaction Sent: hash=${tx.hash} action=${input.action}`);

    const receipt = await tx.wait(1);
    if (!receipt) {
      throw new Error(`Transaction receipt not available: ${tx.hash}`);
    }

    const confirmations = await this.getConfirmations(receipt);
    const contractAddress = this.getContractAddress();

    this.logger.log(`Transaction Confirmed: hash=${receipt.hash} block=${receipt.blockNumber}`);

    return {
      transactionHash: receipt.hash,
      blockHash: receipt.blockHash,
      blockNumber: receipt.blockNumber === null ? null : BigInt(receipt.blockNumber),
      gasUsed: receipt.gasUsed,
      walletAddress: this.wallet.address,
      contractAddress,
      chainId: this.getChainId(),
      explorerUrl: `https://amoy.polygonscan.com/tx/${receipt.hash}`,
      confirmations,
      confirmedAt: new Date(),
      receipt: this.sanitizeReceipt(receipt, confirmations),
    };
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

  private recordMockTraceability(input: RecordTraceabilityInput): BlockchainTransactionResult {
    const confirmedAt = new Date();
    const mockHash = `demo-${createHash('sha256')
      .update(`${input.productId}:${input.batchId ?? ''}:${input.action}:${confirmedAt.toISOString()}`)
      .digest('hex')}`;
    const contractAddress = this.configService.get<string>('CONTRACT_ADDRESS', 'DEMO_CONTRACT');
    const walletAddress = 'DEMO_BACKEND_WALLET';

    this.logger.log(`DEMO_MODE Mock Blockchain Verified: hash=${mockHash} action=${input.action}`);

    return {
      transactionHash: mockHash,
      blockHash: null,
      blockNumber: null,
      gasUsed: 0n,
      walletAddress,
      contractAddress,
      chainId: this.getChainId(),
      explorerUrl: `demo://blockchain/${mockHash}`,
      confirmations: 1,
      confirmedAt,
      receipt: {
        hash: mockHash,
        status: 'DEMO_CONFIRMED',
        confirmations: 1,
        network: 'DEMO_MODE',
        externalSubmission: false,
      },
    };
  }

  private loadAbi(): InterfaceAbi {
    const candidatePaths = [
      join(__dirname, 'abi', 'TraceabilityRegistry.json'),
      join(process.cwd(), 'src', 'features', 'blockchain', 'abi', 'TraceabilityRegistry.json'),
    ];

    for (const abiPath of candidatePaths) {
      try {
        return JSON.parse(readFileSync(abiPath, 'utf8')) as InterfaceAbi;
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

  private sanitizeReceipt(receipt: TransactionReceipt, confirmations: number): Record<string, unknown> {
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
