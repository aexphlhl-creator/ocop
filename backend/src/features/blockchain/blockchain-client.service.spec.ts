import { ConfigService } from '@nestjs/config';
import { ZeroHash, id } from 'ethers';
import {
  BlockchainClientService,
  RecordTraceabilityInput,
} from './blockchain-client.service';

describe('BlockchainClientService - TraceabilityRecorded Event Reconciliation', () => {
  let service: BlockchainClientService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockContract: any;
  let mockProvider: any;
  let mockWallet: any;

  const validMetaHash = id('metadata-json-sample');
  const validDocHash = id('document-pdf-sample');

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string, defaultVal?: any) => {
        if (key === 'DEMO_MODE') return false;
        if (key === 'POLYGON_RPC_URL') return 'https://mock-rpc-provider';
        if (key === 'POLYGON_PRIVATE_KEY')
          return '0x3af34bdf70ae3eccb4146e17e5c6340978a4da2194d92733906e64691b448410';
        if (key === 'CONTRACT_ADDRESS')
          return '0x40F6B1af5A274043360397C13C04f6BBA26622A8';
        if (key === 'POLYGON_CHAIN_ID') return 80002;
        if (key === 'BLOCKCHAIN_SCAN_DEPTH') return 5000;
        return defaultVal;
      }),
    } as any;

    service = new BlockchainClientService(mockConfigService);

    mockProvider = {
      getBlockNumber: jest.fn().mockResolvedValue(100000),
      getTransactionReceipt: jest.fn(),
      getTransaction: jest.fn(),
    };

    mockContract = {
      filters: {
        TraceabilityRecorded: jest.fn().mockReturnValue({
          topics: ['0xTraceabilityRecordedTopic'],
        }),
      },
      queryFilter: jest.fn().mockResolvedValue([]),
      interface: {
        parseLog: jest.fn(),
      },
      hasRecord: jest.fn().mockResolvedValue(false),
      getRecordBlockNumber: jest.fn().mockResolvedValue(BigInt(0)),
    };

    mockWallet = {
      address: '0xMockWalletAddress',
      getNonce: jest.fn().mockResolvedValue(5),
    };

    (service as any).provider = mockProvider;
    (service as any).contract = mockContract;
    (service as any).wallet = mockWallet;
    (service as any).abi = [];
  });

  it('matches all 5 fields on event TraceabilityRecorded and returns authentic transaction details', async () => {
    const input: RecordTraceabilityInput = {
      productId: 'prod-100',
      batchId: 'batch-200',
      action: 'BATCH_RELEASED',
      metadataHash: validMetaHash,
      documentHash: validDocHash,
    };

    const mockEvent = {
      transactionHash: '0xreal_mined_hash_123',
      blockHash: '0xblock_hash_456',
      blockNumber: 99800,
      args: {
        productId: 'prod-100',
        batchId: 'batch-200',
        action: 'BATCH_RELEASED',
        metadataHash: validMetaHash,
        documentHash: validDocHash,
        recorder: '0xMockWalletAddress',
      },
      getTransactionReceipt: jest.fn().mockResolvedValue({
        hash: '0xreal_mined_hash_123',
        blockHash: '0xblock_hash_456',
        blockNumber: 99800,
        gasUsed: BigInt(54321),
        status: 1,
        from: '0xMockWalletAddress',
        to: '0x40F6B1af5A274043360397C13C04f6BBA26622A8',
        confirmations: jest.fn().mockResolvedValue(6),
      }),
    };

    mockContract.queryFilter.mockResolvedValueOnce([mockEvent]);

    const result = await service.findOnChainRecord(input);

    expect(result).not.toBeNull();
    expect(result?.transactionHash).toBe('0xreal_mined_hash_123');
    expect(result?.blockNumber).toBe(BigInt(99800));
    expect(result?.gasUsed).toBe(BigInt(54321));
    expect(result?.confirmations).toBe(6);
    expect(mockContract.filters.TraceabilityRecorded).toHaveBeenCalled();
    expect(mockContract.queryFilter).toHaveBeenCalledWith(
      expect.anything(),
      95000,
      undefined,
    );
  });

  it('handles null documentHash by comparing with ZeroHash', async () => {
    const input: RecordTraceabilityInput = {
      productId: 'prod-100',
      batchId: 'batch-200',
      action: 'BATCH_RELEASED',
      metadataHash: validMetaHash,
      documentHash: null,
    };

    const mockEvent = {
      transactionHash: '0xreal_hash_zero_doc',
      blockHash: '0xblock_hash_789',
      blockNumber: 99850,
      args: {
        productId: 'prod-100',
        batchId: 'batch-200',
        action: 'BATCH_RELEASED',
        metadataHash: validMetaHash,
        documentHash: ZeroHash,
        recorder: '0xMockWalletAddress',
      },
      getTransactionReceipt: jest.fn().mockResolvedValue({
        hash: '0xreal_hash_zero_doc',
        gasUsed: BigInt(21000),
        status: 1,
        confirmations: jest.fn().mockResolvedValue(1),
      }),
    };

    mockContract.queryFilter.mockResolvedValueOnce([mockEvent]);

    const result = await service.findOnChainRecord(input);
    expect(result).not.toBeNull();
    expect(result?.transactionHash).toBe('0xreal_hash_zero_doc');
  });

  it('rejects match if any of the 5 fields differs (e.g. metadataHash mismatch)', async () => {
    const input: RecordTraceabilityInput = {
      productId: 'prod-100',
      batchId: 'batch-200',
      action: 'BATCH_RELEASED',
      metadataHash: validMetaHash,
      documentHash: validDocHash,
    };

    const mockEventDifferentMeta = {
      transactionHash: '0xunrelated_tx',
      args: {
        productId: 'prod-100',
        batchId: 'batch-200',
        action: 'BATCH_RELEASED',
        metadataHash: id('different-metadata'),
        documentHash: validDocHash,
      },
    };

    mockContract.queryFilter.mockResolvedValueOnce([mockEventDifferentMeta]);

    const result = await service.findOnChainRecord(input);
    expect(result).toBeNull();
  });

  it('reconciles old event outside scan depth when contract hasRecord and getRecordBlockNumber return mined block', async () => {
    const input: RecordTraceabilityInput = {
      productId: 'prod-ancient',
      batchId: 'batch-ancient',
      action: 'BATCH_RELEASED',
      metadataHash: validMetaHash,
      documentHash: validDocHash,
    };

    // Mined 50,000 blocks ago! (Outside standard 5000 scan depth)
    mockContract.hasRecord.mockResolvedValueOnce(true);
    mockContract.getRecordBlockNumber.mockResolvedValueOnce(BigInt(50000));

    const mockOldEvent = {
      transactionHash: '0xancient_tx_hash',
      blockHash: '0xancient_block_hash',
      blockNumber: 50000,
      args: {
        productId: 'prod-ancient',
        batchId: 'batch-ancient',
        action: 'BATCH_RELEASED',
        metadataHash: validMetaHash,
        documentHash: validDocHash,
        recorder: '0xMockWalletAddress',
      },
      getTransactionReceipt: jest.fn().mockResolvedValue({
        hash: '0xancient_tx_hash',
        blockHash: '0xancient_block_hash',
        blockNumber: 50000,
        gasUsed: BigInt(21000),
        status: 1,
        from: '0xMockWalletAddress',
        confirmations: jest.fn().mockResolvedValue(50000),
      }),
    };

    // Query targeted at block 50000
    mockContract.queryFilter.mockResolvedValueOnce([mockOldEvent]);

    const result = await service.findOnChainRecord(input);

    expect(result).not.toBeNull();
    expect(result?.transactionHash).toBe('0xancient_tx_hash');
    expect(mockContract.queryFilter).toHaveBeenCalledWith(
      expect.anything(),
      50000,
      50000,
    );
  });

  it('retains uncertain state when wallet has pending transaction in mempool (pending nonce > latest nonce)', async () => {
    const input: RecordTraceabilityInput = {
      productId: 'prod-mempool',
      batchId: 'batch-mempool',
      action: 'BATCH_RELEASED',
      metadataHash: validMetaHash,
    };

    // Wallet has pending transaction in mempool
    mockWallet.getNonce.mockImplementation((tag: string) => {
      if (tag === 'latest') return Promise.resolve(10);
      if (tag === 'pending') return Promise.resolve(11); // pending > latest!
      return Promise.resolve(10);
    });

    mockContract.queryFilter.mockResolvedValueOnce([]);

    await expect(service.findOnChainRecord(input)).rejects.toThrow(
      'PENDING_MEMPOOL_TRANSACTION: Wallet has 1 pending transaction(s) in mempool. Cannot confirm absence of prior broadcast.',
    );
  });

  it('handles knownTxHash that is currently pending in mempool by waiting for receipt', async () => {
    const input: RecordTraceabilityInput = {
      productId: 'prod-100',
      action: 'BATCH_RELEASED',
      metadataHash: validMetaHash,
      knownTxHash: '0xpending_tx_in_mempool',
    };

    const mockPendingTx = {
      hash: '0xpending_tx_in_mempool',
      blockNumber: null, // Still in mempool!
      from: '0xMockWalletAddress',
      wait: jest.fn().mockResolvedValue({
        hash: '0xpending_tx_in_mempool',
        blockHash: '0xnewly_mined_block_hash',
        blockNumber: 100001,
        gasUsed: BigInt(25000),
        status: 1,
        confirmations: jest.fn().mockResolvedValue(1),
      }),
    };

    mockProvider.getTransaction.mockResolvedValueOnce(mockPendingTx);

    const result = await service.findOnChainRecord(input);

    expect(result).not.toBeNull();
    expect(result?.transactionHash).toBe('0xpending_tx_in_mempool');
    expect(mockPendingTx.wait).toHaveBeenCalledWith(1);
  });

  it('propagates RPC_QUERY_FAILED when queryFilter throws an RPC or network error', async () => {
    const input: RecordTraceabilityInput = {
      productId: 'prod-100',
      batchId: 'batch-200',
      action: 'BATCH_RELEASED',
      metadataHash: validMetaHash,
    };

    mockContract.queryFilter.mockRejectedValueOnce(
      new Error('timeout exceeded or rate limited on provider'),
    );

    await expect(service.findOnChainRecord(input)).rejects.toThrow(
      'RPC_QUERY_FAILED: timeout exceeded or rate limited on provider',
    );
  });

  it('propagates RPC_QUERY_FAILED when provider.getBlockNumber fails', async () => {
    const input: RecordTraceabilityInput = {
      productId: 'prod-100',
      action: 'BATCH_RELEASED',
      metadataHash: validMetaHash,
    };

    mockProvider.getBlockNumber.mockRejectedValueOnce(
      new Error('connection refused to RPC node'),
    );

    await expect(service.findOnChainRecord(input)).rejects.toThrow(
      'RPC_QUERY_FAILED: Unable to determine current block number: connection refused to RPC node',
    );
  });
});
