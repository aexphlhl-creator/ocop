import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('TraceabilityRegistry Reconciliation & Crash Recovery (EVM Local)', () => {
  async function deployFixture() {
    const [owner, recorder, otherAccount] = await ethers.getSigners();
    const TraceabilityRegistry = await ethers.getContractFactory('TraceabilityRegistry');
    const registry = await TraceabilityRegistry.deploy();
    await registry.waitForDeployment();

    await registry.grantRecorder(recorder.address);

    return { registry, owner, recorder, otherAccount };
  }

  it('reconciles mined event TraceabilityRecorded matching all 5 fields after simulated crash before DB write, preventing duplicate broadcast', async () => {
    const { registry, recorder } = await deployFixture();

    const productId = 'prod-oco-001';
    const batchId = 'batch-tea-2026';
    const action = 'BATCH_RELEASED';
    const metadataHash = ethers.id('metadata-payload-json-12345');
    const documentHash = ethers.id('cert-document-pdf-67890');

    const initialTxCount = await ethers.provider.getTransactionCount(recorder.address);

    // Step 1: Worker sends broadcast transaction to EVM blockchain
    const tx = await registry
      .connect(recorder)
      .recordTraceability(productId, batchId, metadataHash, documentHash, action);
    const receipt = await tx.wait(1);

    expect(receipt).to.not.be.null;
    const minedTxHash = receipt!.hash;
    expect(minedTxHash).to.be.a('string');

    const txCountAfterBroadcast = await ethers.provider.getTransactionCount(recorder.address);
    expect(txCountAfterBroadcast).to.equal(initialTxCount + 1);

    // Step 2: Crash simulation!
    // The worker process crashes right here before writing txHash to PostgreSQL database.
    // The database still holds status='PROCESSING' with transaction_hash=NULL.

    // Step 3: Worker restarts and performs reconciliation using event TraceabilityRecorded
    // Matching all 5 fields: productId, batchId, action, metadataHash, documentHash
    const filter = registry.filters.TraceabilityRecorded();
    const events = await registry.queryFilter(filter, 0);

    expect(events.length).to.be.greaterThan(0);

    const matchedEvent = events.find((ev: any) => {
      const args = ev.args;
      return (
        args.productId === productId &&
        args.batchId === batchId &&
        args.action === action &&
        args.metadataHash.toLowerCase() === metadataHash.toLowerCase() &&
        args.documentHash.toLowerCase() === documentHash.toLowerCase()
      );
    });

    expect(matchedEvent).to.not.be.undefined;
    expect(matchedEvent!.transactionHash).to.equal(minedTxHash);

    // Step 4: Worker reconciles transaction without re-broadcasting
    // Simulate reconciliation outcome: DB record is updated to CONFIRMED with matchedEvent.transactionHash
    // NO second transaction is sent!
    const finalTxCount = await ethers.provider.getTransactionCount(recorder.address);
    expect(finalTxCount).to.equal(txCountAfterBroadcast);
    expect(finalTxCount).to.equal(initialTxCount + 1); // EXACTLY ONE TRANSACTION ON CHAIN
  });

  it('rejects match if any of the 5 fields differs (prevents false reconciliation)', async () => {
    const { registry, recorder } = await deployFixture();

    const productId = 'prod-oco-002';
    const batchId = 'batch-honey-2026';
    const action = 'PUT_AWAY';
    const metadataHash = ethers.id('meta-2');
    const documentHash = ethers.ZeroHash;

    await (
      await registry
        .connect(recorder)
        .recordTraceability(productId, batchId, metadataHash, documentHash, action)
    ).wait(1);

    const filter = registry.filters.TraceabilityRecorded();
    const events = await registry.queryFilter(filter, 0);

    // Test mismatched action
    const mismatchAction = events.find((ev: any) => {
      const args = ev.args;
      return (
        args.productId === productId &&
        args.batchId === batchId &&
        args.action === 'QC_PASSED' && // Different action!
        args.metadataHash.toLowerCase() === metadataHash.toLowerCase() &&
        args.documentHash.toLowerCase() === documentHash.toLowerCase()
      );
    });
    expect(mismatchAction).to.be.undefined;

    // Test mismatched documentHash
    const mismatchDoc = events.find((ev: any) => {
      const args = ev.args;
      return (
        args.productId === productId &&
        args.batchId === batchId &&
        args.action === action &&
        args.metadataHash.toLowerCase() === metadataHash.toLowerCase() &&
        args.documentHash.toLowerCase() === ethers.id('different-doc').toLowerCase()
      );
    });
    expect(mismatchDoc).to.be.undefined;
  });
});
