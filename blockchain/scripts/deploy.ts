import { ethers } from 'hardhat';

async function main() {
  const TraceabilityRegistry = await ethers.getContractFactory('TraceabilityRegistry');
  const registry = await TraceabilityRegistry.deploy();
  await registry.waitForDeployment();

  const contractAddress = await registry.getAddress();
  console.log(`TraceabilityRegistry deployed to: ${contractAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
