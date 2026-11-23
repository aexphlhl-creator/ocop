import { ConfigService } from '@nestjs/config';
import { JsonRpcProvider, Wallet, Contract, ContractFactory } from 'ethers';
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/features/prisma/prisma.service';
import { BlockchainClientService } from '../src/features/blockchain/blockchain-client.service';
import { BlockchainQueueService } from '../src/features/blockchain-queue/blockchain-queue.service';
import { BlockchainJobType } from '../src/features/blockchain-queue/blockchain.queue';
import * as TraceabilityRegistryArtifact from '../src/features/blockchain/abi/TraceabilityRegistry.json';

describe('Blockchain Integration: Client, Outbox Worker, Hardhat EVM, PostgreSQL & Redis', () => {
  let provider: JsonRpcProvider;
  let wallet: Wallet;
  let contract: any;
  let contractAddress: string;

  let prisma: PrismaService;
  let configService: ConfigService;
  let clsService: any;
  let blockchainClient: BlockchainClientService;
  let queueService: BlockchainQueueService;

  const HARDHAT_RPC_URL = 'http://127.0.0.1:8545';
  // Account #0 default private key on Hardhat node
  const HARDHAT_PRIVATE_KEY =
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

  beforeAll(async () => {
    provider = new JsonRpcProvider(HARDHAT_RPC_URL, 31337);
    wallet = new Wallet(HARDHAT_PRIVATE_KEY, provider);

    const bytecode =
      (TraceabilityRegistryArtifact as any).bytecode?.object ||
      (TraceabilityRegistryArtifact as any).bytecode;

    const registryFactory = new ContractFactory(
      TraceabilityRegistryArtifact.abi,
      bytecode,
      wallet,
    );
    contract = (await registryFactory.deploy()) as any;
    await contract.waitForDeployment();
    contractAddress = await contract.getAddress();

    const dbUrl =
      process.env.TEST_DATABASE_URL ||
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/ocop_test?sslmode=disable';

    // Wire real ConfigService targeting local Hardhat EVM, PostgreSQL & Redis DB 2
    configService = new ConfigService({
      DATABASE_URL: dbUrl,
      POLYGON_RPC_URL: HARDHAT_RPC_URL,
      POLYGON_PRIVATE_KEY: HARDHAT_PRIVATE_KEY,
      CONTRACT_ADDRESS: contractAddress,
      POLYGON_CHAIN_ID: 31337,
      BLOCKCHAIN_SCAN_DEPTH: 5000,
      DEMO_MODE: false,
      REDIS_HOST: process.env.REDIS_HOST || 'localhost',
      REDIS_PORT: Number(process.env.REDIS_PORT || 6379),
      REDIS_DB: Number(process.env.TEST_REDIS_DB || process.env.REDIS_DB || 1),
    });

    prisma = new PrismaService(configService);
    await prisma.$connect();

    clsService = {
      get: jest.fn().mockReturnValue('int-test-req-id'),
    };

    blockchainClient = new BlockchainClientService(configService);
    blockchainClient.onModuleInit();

    provider.pollingInterval = 100;
    if (blockchainClient.getProvider()) {
      (blockchainClient.getProvider() as any).pollingInterval = 100;
    }

    queueService = new BlockchainQueueService(
      configService,
      prisma,
      blockchainClient,
      clsService,
    );
    await queueService.onModuleInit();

    // Ensure baseline Category, OcopLevel, Province, Ward and Seller exist in disposable DB
    let category = await prisma.category.findFirst();
    if (!category) {
      category = await prisma.category.create({
        data: {
          name: `Test Category ${Date.now()}`,
          slug: `test-cat-${Date.now()}`,
        },
      });
    }
    let ocopLevel = await prisma.ocopLevel.findFirst();
    if (!ocopLevel) {
      ocopLevel = await prisma.ocopLevel.create({
        data: { level: 4, title: '4 Sao Test' },
      });
    }
    let province = await prisma.province.findFirst();
    if (!province) {
      province = await prisma.province.create({
        data: {
          name: `Test Province ${Date.now()}`,
          code: `P${Date.now()}`.substring(0, 10),
          latitude: 10.762622,
          longitude: 106.660172,
        },
      });
    }
    let ward = await prisma.ward.findFirst();
    if (!ward) {
      ward = await prisma.ward.create({
        data: {
          name: `Test Ward ${Date.now()}`,
          provinceId: province.id,
          latitude: 10.762622,
          longitude: 106.660172,
        },
      });
    }
    const sellerRole = await prisma.role.findUniqueOrThrow({
      where: { name: 'SELLER' },
    });
    await prisma.user.create({
      data: {
        email: `seller_bc_${Date.now()}@test.vn`,
        passwordHash: 'hash',
        fullName: 'Seller Test',
        roleId: sellerRole.id,
      },
    });
  }, 30000);

  function to0xBytes32(hash: string): string {
    return hash.startsWith('0x') ? hash : `0x${hash}`;
  }

  async function getTrueTxCount(tag: string = 'latest'): Promise<number> {
    const hex = await provider.send('eth_getTransactionCount', [
      wallet.address,
      tag,
    ]);
    return parseInt(hex, 16);
  }

  async function createTestProduct(): Promise<string> {
    const category = await prisma.category.findFirstOrThrow();
    const ocopLevel = await prisma.ocopLevel.findFirstOrThrow();
    const province = await prisma.province.findFirstOrThrow();
    const ward = await prisma.ward.findFirstOrThrow();
    const seller = await prisma.user.findFirstOrThrow({
      where: { role: { name: 'SELLER' } },
    });
    const id = randomUUID();
    const product = await prisma.product.create({
      data: {
        id,
        slug: `product-${id}`,
        name: `OCOP Test Product ${id}`,
        description: 'Test description',
        price: 100000,
        unit: 'kg',
        categoryId: category.id,
        ocopLevelId: ocopLevel.id,
        sellerId: seller.id,
        provinceId: province.id,
        wardId: ward.id,
        latitude: 10.762622,
        longitude: 106.660172,
      },
    });
    return product.id;
  }

  afterAll(async () => {
    // Re-enable automining if modified
    try {
      await provider.send('evm_setAutomine', [true]);
    } catch {
      // ignore
    }
    if (queueService) {
      await queueService.onModuleDestroy();
    }
    if (blockchainClient) {
      await blockchainClient.onModuleDestroy();
    }
    if (provider && typeof (provider as any).destroy === 'function') {
      try {
        (provider as any).destroy();
      } catch {
        // ignore
      }
    }
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it('Scenario 1 (Crash truoc broadcast): DB committed outbox record, worker crashed before broadcast; on restart, safely broadcasts, confirms and creates exactly 1 on-chain record', async () => {
    const productId = await createTestProduct();
    const batchId = randomUUID();
    const payload = {
      action: 'BATCH_RELEASED',
      productId,
      batchId,
      note: 'Pre-broadcast crash test',
      timestamp: new Date().toISOString(),
    };

    // Step 1: Record committed in PostgreSQL transaction (status: QUEUED)
    const outboxRecord = await prisma.$transaction(async (tx) => {
      return queueService.createOutboxRecord(tx, {
        productId,
        batchId,
        journeyId: null,
        action: BlockchainJobType.SUPPLY_CHAIN_RECORD,
        data: payload,
      });
    });

    expect(outboxRecord.status).toBe('QUEUED');
    expect(outboxRecord.transactionHash).toBeNull();

    // Step 2: Simulated crash occurs here before calling recordTraceability.
    // Verify that contract does not have this record yet
    const hasRecordBefore = await contract.hasRecord(
      productId,
      batchId,
      String(BlockchainJobType.SUPPLY_CHAIN_RECORD),
      to0xBytes32((queueService as any).hashMetadata(payload)),
      '0x0000000000000000000000000000000000000000000000000000000000000000',
    );
    expect(hasRecordBefore).toBe(false);

    // Step 3: Worker restarts and processes the job
    await queueService.processTraceabilityJob({
      type: BlockchainJobType.SUPPLY_CHAIN_RECORD,
      productId,
      batchId,
      journeyId: null,
      payload,
      actorId: 'test-qa-user',
    });

    // Step 4: Verify DB record is CONFIRMED
    const updatedRecord = await prisma.blockchainRecord.findUnique({
      where: { id: outboxRecord.id },
    });
    expect(updatedRecord?.status).toBe('CONFIRMED');
    expect(updatedRecord?.transactionHash).toBeDefined();

    // Step 5: Verify on-chain ledger: exactly 1 record recorded
    const onChainRecords = await contract.getProductRecords(productId);
    expect(onChainRecords).toHaveLength(1);
    expect(onChainRecords[0].productId).toBe(productId);
    expect(onChainRecords[0].batchId).toBe(batchId);
  });

  it('Scenario 2 (Crash sau broadcast): Transaction mined on EVM, but worker crashed before DB update; on restart, reconciles authentic txHash without duplicate broadcast', async () => {
    const productId = await createTestProduct();
    const batchId = randomUUID();
    const payload = {
      action: 'BATCH_RELEASED',
      productId,
      batchId,
      note: 'Post-broadcast crash recovery test',
      timestamp: new Date().toISOString(),
    };

    const outboxRecord = await prisma.$transaction(async (tx) => {
      return queueService.createOutboxRecord(tx, {
        productId,
        batchId,
        journeyId: null,
        action: BlockchainJobType.SUPPLY_CHAIN_RECORD,
        data: payload,
      });
    });

    // Broadcast directly on chain
    const metadataHash = to0xBytes32((queueService as any).hashMetadata(payload));
    const tx = await contract.recordTraceability(
      productId,
      batchId,
      metadataHash,
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      String(BlockchainJobType.SUPPLY_CHAIN_RECORD),
      { nonce: await getTrueTxCount('latest') },
    );
    const receipt = await tx.wait(1);
    const minedTxHash = receipt.hash;

    // Simulate worker crash: DB still has status PROCESSING and null transactionHash
    await prisma.blockchainRecord.update({
      where: { id: outboxRecord.id },
      data: { status: 'PROCESSING', transactionHash: null },
    });

    const txCountBeforeRetry = await getTrueTxCount('latest');

    // Step 3: Worker restarts / retries
    await queueService.processTraceabilityJob({
      type: BlockchainJobType.SUPPLY_CHAIN_RECORD,
      productId,
      batchId,
      journeyId: null,
      payload,
      actorId: 'test-qa-user',
    });

    // Step 4: Verification - DB record recovered authentic mined txHash
    const recoveredRecord = await prisma.blockchainRecord.findUnique({
      where: { id: outboxRecord.id },
    });
    expect(recoveredRecord?.status).toBe('CONFIRMED');
    expect(recoveredRecord?.transactionHash).toBe(minedTxHash);

    // CRITICAL: No second transaction was broadcast (wallet transaction count unchanged!)
    const txCountAfterRetry = await getTrueTxCount('latest');
    expect(txCountAfterRetry).toBe(txCountBeforeRetry);

    // On-chain records count is strictly 1
    const records = await contract.getProductRecords(productId);
    expect(records).toHaveLength(1);
  });

  it('Scenario 3 (Pending transaction in mempool): Worker detects pending transaction in mempool, does not broadcast duplicate, waits for confirmation', async () => {
    const productId = await createTestProduct();
    const batchId = randomUUID();
    const payload = {
      action: 'BATCH_RELEASED',
      productId,
      batchId,
      note: 'Pending mempool test',
      timestamp: new Date().toISOString(),
    };

    const outboxRecord = await prisma.$transaction(async (tx) => {
      return queueService.createOutboxRecord(tx, {
        productId,
        batchId,
        journeyId: null,
        action: BlockchainJobType.SUPPLY_CHAIN_RECORD,
        data: payload,
      });
    });

    // Disable automining to simulate mempool delay
    await provider.send('evm_setAutomine', [false]);

    const metadataHash = to0xBytes32((queueService as any).hashMetadata(payload));
    const pendingTx = await contract.recordTraceability(
      productId,
      batchId,
      metadataHash,
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      String(BlockchainJobType.SUPPLY_CHAIN_RECORD),
    );

    // Transaction is in mempool, blockNumber is null!
    const mempoolTx = await provider.getTransaction(pendingTx.hash);
    expect(mempoolTx?.blockNumber).toBeNull();

    // Save known pending txHash in DB
    await prisma.blockchainRecord.update({
      where: { id: outboxRecord.id },
      data: {
        status: 'PROCESSING',
        transactionHash: pendingTx.hash,
        txId: pendingTx.hash,
      },
    });

    const txCountPending = await getTrueTxCount('pending');

    // Trigger mining in background after 500ms while worker waits
    setTimeout(async () => {
      await provider.send('evm_mine', []);
      await provider.send('evm_setAutomine', [true]);
    }, 500);

    // Worker processes: detects pending tx, waits for it, does NOT broadcast duplicate
    await queueService.processTraceabilityJob({
      type: BlockchainJobType.SUPPLY_CHAIN_RECORD,
      productId,
      batchId,
      journeyId: null,
      payload,
      actorId: 'test-qa-user',
    });

    const confirmedRecord = await prisma.blockchainRecord.findUnique({
      where: { id: outboxRecord.id },
    });
    expect(confirmedRecord?.status).toBe('CONFIRMED');
    expect(confirmedRecord?.transactionHash).toBe(pendingTx.hash);

    // Exactly 1 transaction mined on-chain (the original pendingTx), zero duplicate broadcast
    const records = await contract.getProductRecords(productId);
    expect(records).toHaveLength(1);
    const txCountAfter = await getTrueTxCount('latest');
    expect(txCountAfter).toBe(txCountPending);
  });

  it('Scenario 4 (RPC query failure): When RPC query fails, retains uncertain status and never sends duplicate transaction', async () => {
    const productId = await createTestProduct();
    const batchId = randomUUID();
    const payload = {
      action: 'BATCH_RELEASED',
      productId,
      batchId,
      note: 'RPC failure simulation',
      timestamp: new Date().toISOString(),
    };

    const outboxRecord = await prisma.$transaction(async (tx) => {
      return queueService.createOutboxRecord(tx, {
        productId,
        batchId,
        journeyId: null,
        action: BlockchainJobType.SUPPLY_CHAIN_RECORD,
        data: payload,
      });
    });

    // Mock an RPC failure during findOnChainRecord
    jest
      .spyOn(blockchainClient, 'findOnChainRecord')
      .mockRejectedValueOnce(new Error('RPC_QUERY_FAILED: Connection timeout'));

    const txCountBefore = await getTrueTxCount('latest');

    await expect(
      queueService.processTraceabilityJob({
        type: BlockchainJobType.SUPPLY_CHAIN_RECORD,
        productId,
        batchId,
        journeyId: null,
        payload,
        actorId: 'test-qa-user',
      }),
    ).rejects.toThrow('RPC_QUERY_FAILED');

    // DB record retains uncertain status (errorMessage logged, not marked CONFIRMED or FAILED)
    const recordInDb = await prisma.blockchainRecord.findUnique({
      where: { id: outboxRecord.id },
    });
    expect(recordInDb?.status).toBe('QUEUED');
    expect(recordInDb?.errorMessage).toContain('RPC reconciliation failed');

    // Zero transactions sent to blockchain
    const txCountAfter = await getTrueTxCount('latest');
    expect(txCountAfter).toBe(txCountBefore);
  });

  it('Scenario 5 (Event cu ngoai cua so 10.000 block): Fast-forward chain by 10,500 blocks; contract-enforced block lookup targets exact block and reconciles with 0 duplicate broadcast', async () => {
    const productId = await createTestProduct();
    const batchId = randomUUID();
    const payload = {
      action: 'BATCH_RELEASED',
      productId,
      batchId,
      note: '10,500 blocks fast-forward test',
      timestamp: new Date().toISOString(),
    };

    const outboxRecord = await prisma.$transaction(async (tx) => {
      return queueService.createOutboxRecord(tx, {
        productId,
        batchId,
        journeyId: null,
        action: BlockchainJobType.SUPPLY_CHAIN_RECORD,
        data: payload,
      });
    });

    // Broadcast transaction and mine it
    const metadataHash = to0xBytes32((queueService as any).hashMetadata(payload));
    const tx = await contract.recordTraceability(
      productId,
      batchId,
      metadataHash,
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      String(BlockchainJobType.SUPPLY_CHAIN_RECORD),
      { nonce: await getTrueTxCount('latest') },
    );
    const receipt = await tx.wait(1);
    const minedBlock = Number(receipt.blockNumber);

    // Fast-forward EVM by 10,500 blocks!
    await provider.send('hardhat_mine', ['0x2904']); // 10,500 blocks in hex
    const currentBlock = parseInt(await provider.send('eth_blockNumber', []), 16);
    expect(currentBlock - minedBlock).toBeGreaterThan(10000);

    // Simulate worker crash before DB update
    await prisma.blockchainRecord.update({
      where: { id: outboxRecord.id },
      data: { status: 'PROCESSING', transactionHash: null },
    });

    const txCountBefore = await getTrueTxCount('latest');

    // Worker restarts: contract-enforced getRecordBlockNumber targets exact minedBlock
    await queueService.processTraceabilityJob({
      type: BlockchainJobType.SUPPLY_CHAIN_RECORD,
      productId,
      batchId,
      journeyId: null,
      payload,
      actorId: 'test-qa-user',
    });

    // DB record recovered and confirmed
    const confirmedRecord = await prisma.blockchainRecord.findUnique({
      where: { id: outboxRecord.id },
    });
    expect(confirmedRecord?.status).toBe('CONFIRMED');
    expect(confirmedRecord?.transactionHash).toBe(receipt.hash);

    // ZERO duplicate broadcast
    const txCountAfter = await getTrueTxCount('latest');
    expect(txCountAfter).toBe(txCountBefore);

    // On-chain records count is strictly 1
    const records = await contract.getProductRecords(productId);
    expect(records).toHaveLength(1);
  });

  it('Scenario 6 (Contract-enforced duplicate rejection): Attempting to write duplicate record directly reverts on EVM with DuplicateRecord', async () => {
    const productId = await createTestProduct();
    const batchId = randomUUID();
    const metadataHash = to0xBytes32(
      (queueService as any).hashMetadata({ data: 'test' }),
    );
    const docHash =
      '0x0000000000000000000000000000000000000000000000000000000000000000';
    const action = 'BATCH_RELEASED';

    // First write succeeds
    await (
      await contract.recordTraceability(
        productId,
        batchId,
        metadataHash,
        docHash,
        action,
      )
    ).wait(1);

    // Second write with identical fields MUST revert on EVM with DuplicateRecord
    await expect(
      contract.recordTraceability(
        productId,
        batchId,
        metadataHash,
        docHash,
        action,
      ),
    ).rejects.toThrow();

    const records = await contract.getProductRecords(productId);
    expect(records).toHaveLength(1);
  });

  it('Scenario 7 (Automatic Outbox Recovery sau khi worker chet voi transactionHash): broadcast -> luu hash -> worker chet -> restart -> tu phuc hoi CONFIRMED khong goi xu ly thu cong', async () => {
    const productId = await createTestProduct();
    const batchId = randomUUID();
    const payload = {
      action: 'BATCH_RELEASED',
      productId,
      batchId,
      note: 'Autonomous outbox recovery after worker crash',
      timestamp: new Date().toISOString(),
    };

    // Step 1: Commit business outbox record
    const outboxRecord = await prisma.$transaction(async (tx) => {
      return queueService.createOutboxRecord(tx, {
        productId,
        batchId,
        journeyId: null,
        action: BlockchainJobType.SUPPLY_CHAIN_RECORD,
        data: payload,
      });
    });

    // Step 2: Broadcast transaction directly on chain to obtain genuine txHash
    const metadataHash = to0xBytes32(
      (queueService as any).hashMetadata(payload),
    );
    const tx = await contract.recordTraceability(
      productId,
      batchId,
      metadataHash,
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      String(BlockchainJobType.SUPPLY_CHAIN_RECORD),
      { nonce: await getTrueTxCount('latest') },
    );
    const receipt = await tx.wait(1);
    const minedTxHash = receipt.hash;

    // Step 3: Worker persists txHash with status PROCESSING, then crashes!
    // Simulate expired lease by backdating updatedAt past 120s timeout
    const expiredLeaseTime = new Date(Date.now() - 150000);
    await prisma.blockchainRecord.update({
      where: { id: outboxRecord.id },
      data: {
        status: 'PROCESSING',
        transactionHash: minedTxHash,
        txId: minedTxHash,
        updatedAt: expiredLeaseTime,
      },
    });

    const txCountBeforeRestart = await getTrueTxCount('latest');

    // Step 4: Worker crashed! Destroy existing worker instance
    await queueService.onModuleDestroy();

    // Step 5: Worker service restarts in a new process / container
    const newWorker = new BlockchainQueueService(
      configService,
      prisma,
      blockchainClient,
      clsService,
    );

    // Boot up the new worker -> triggers onModuleInit which sweeps outbox autonomously
    // CRITICAL: We do NOT call processTraceabilityJob or processSupplyChainRecord manually!
    await newWorker.onModuleInit();
    queueService = newWorker;

    // Step 6: Verify DB record is automatically transitioned to CONFIRMED
    const recoveredRecord = await prisma.blockchainRecord.findUnique({
      where: { id: outboxRecord.id },
    });
    expect(recoveredRecord?.status).toBe('CONFIRMED');
    expect(recoveredRecord?.transactionHash).toBe(minedTxHash);
    expect(recoveredRecord?.blockNumber).toBeDefined();
    expect(recoveredRecord?.receipt).toBeDefined();
    expect(recoveredRecord?.errorMessage).toBeNull();

    // Verify 0 duplicate transactions were broadcast
    const txCountAfterRestart = await getTrueTxCount('latest');
    expect(txCountAfterRestart).toBe(txCountBeforeRestart);

    const onChainRecords = await contract.getProductRecords(productId);
    expect(onChainRecords).toHaveLength(1);
  });

  it('Scenario 8 (Receipt status === 0 revert tren Hardhat EVM): Giao dich bi revert tren on-chain (receipt.status === 0), worker restart tu dong phuc hoi sang FAILED, tuyet doi khong CONFIRMED', async () => {
    const productId = await createTestProduct();
    const batchId = randomUUID();
    const payload = {
      action: 'BATCH_RELEASED',
      productId,
      batchId,
      note: 'Reverted on-chain transaction test',
      timestamp: new Date().toISOString(),
    };

    // Step 1: Commit business outbox record
    const outboxRecord = await prisma.$transaction(async (tx) => {
      return queueService.createOutboxRecord(tx, {
        productId,
        batchId,
        journeyId: null,
        action: BlockchainJobType.SUPPLY_CHAIN_RECORD,
        data: payload,
      });
    });

    const metadataHash = to0xBytes32(
      (queueService as any).hashMetadata(payload),
    );

    // Step 2: Broadcast a genuine EVM transaction that explicitly reverts on-chain
    // Passing empty string for productId triggers contract revert: EmptyProductId()
    const revertCalldata = contract.interface.encodeFunctionData(
      'recordTraceability',
      [
        '', // empty productId triggers revert EmptyProductId()
        batchId,
        metadataHash,
        '0x0000000000000000000000000000000000000000000000000000000000000000',
        String(BlockchainJobType.SUPPLY_CHAIN_RECORD),
      ],
    );

    let revertedTxHash: string | null = null;
    try {
      const revertedTx = await wallet.sendTransaction({
        to: await contract.getAddress(),
        data: revertCalldata,
        gasLimit: 100000,
        nonce: await getTrueTxCount('latest'),
      });
      revertedTxHash = revertedTx.hash;
    } catch (sendErr: any) {
      // Hardhat mines the reverted transaction and returns txHash in RPC error payload
      revertedTxHash =
        sendErr?.error?.data?.txHash ??
        sendErr?.data?.txHash ??
        sendErr?.info?.error?.data?.txHash ??
        sendErr?.transactionHash ??
        null;
    }

    expect(revertedTxHash).toBeDefined();
    const minedReceipt = await provider.getTransactionReceipt(revertedTxHash!);

    expect(minedReceipt).toBeDefined();
    expect(Number(minedReceipt!.status)).toBe(0); // STRICTLY 0 (REVERTED ON-CHAIN)

    // Step 3: Record was updated to PROCESSING with reverted txHash before worker crashed
    const expiredLeaseTime = new Date(Date.now() - 150000);
    await prisma.blockchainRecord.update({
      where: { id: outboxRecord.id },
      data: {
        status: 'PROCESSING',
        transactionHash: revertedTxHash,
        txId: revertedTxHash,
        updatedAt: expiredLeaseTime,
      },
    });

    // Step 4: Worker crashed!
    await queueService.onModuleDestroy();

    // Step 5: Worker restarts in new process/container
    const restartingWorker = new BlockchainQueueService(
      configService,
      prisma,
      blockchainClient,
      clsService,
    );

    // Boot up the worker -> automatically triggers onModuleInit() outbox recovery
    await restartingWorker.onModuleInit();
    queueService = restartingWorker;

    // Step 6: Verify DB record is transitioned to FAILED and NEVER CONFIRMED
    const reconciledRecord = await prisma.blockchainRecord.findUnique({
      where: { id: outboxRecord.id },
    });

    expect(reconciledRecord?.status).toBe('FAILED');
    expect(reconciledRecord?.status).not.toBe('CONFIRMED');
    expect(reconciledRecord?.errorMessage).toBe('TRANSACTION_REVERTED_ON_CHAIN');
    expect(reconciledRecord?.transactionHash).toBe(revertedTxHash);
    expect(reconciledRecord?.receipt).toBeDefined();
    expect(Number((reconciledRecord?.receipt as any)?.status)).toBe(0);
  });
});
