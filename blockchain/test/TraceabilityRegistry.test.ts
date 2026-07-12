import { expect } from 'chai';
import { ethers } from 'hardhat';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';

describe('TraceabilityRegistry', () => {
  async function deployRegistry() {
    const [owner, recorder, outsider] = await ethers.getSigners();
    const TraceabilityRegistry = await ethers.getContractFactory('TraceabilityRegistry');
    const registry = await TraceabilityRegistry.deploy();
    await registry.waitForDeployment();

    return { registry, owner, recorder, outsider };
  }

  it('allows owner to grant a recorder and record traceability', async () => {
    const { registry, recorder } = await deployRegistry();
    const metadataHash = ethers.id('metadata');
    const documentHash = ethers.id('document');

    await registry.grantRecorder(recorder.address);

    await expect(
      registry
        .connect(recorder)
        .recordTraceability('product-1', 'batch-1', metadataHash, documentHash, 'CERTIFICATE_RECORD'),
    )
      .to.emit(registry, 'TraceabilityRecorded')
      .withArgs(
        'product-1',
        'batch-1',
        'CERTIFICATE_RECORD',
        metadataHash,
        documentHash,
        anyValue,
        recorder.address,
      );

    const productRecords = await registry.getProductRecords('product-1');
    const batchRecords = await registry.getBatchRecords('batch-1');

    expect(productRecords).to.have.length(1);
    expect(batchRecords).to.have.length(1);
    expect(productRecords[0].recorder).to.equal(recorder.address);
  });

  it('rejects writes from non-recorders', async () => {
    const { registry, outsider } = await deployRegistry();

    await expect(
      registry
        .connect(outsider)
        .recordTraceability('product-1', 'batch-1', ethers.id('metadata'), ethers.ZeroHash, 'SUPPLY_CHAIN_RECORD'),
    ).to.be.revertedWithCustomError(registry, 'OnlyRecorder');
  });

  it('allows owner to revoke a recorder', async () => {
    const { registry, recorder } = await deployRegistry();

    await registry.grantRecorder(recorder.address);
    await registry.revokeRecorder(recorder.address);

    await expect(
      registry
        .connect(recorder)
        .recordTraceability('product-1', '', ethers.id('metadata'), ethers.ZeroHash, 'SUPPLY_CHAIN_RECORD'),
    ).to.be.revertedWithCustomError(registry, 'OnlyRecorder');
  });
});
