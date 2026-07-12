import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

const TraceabilityRegistryModule = buildModule('TraceabilityRegistryModule', (m) => {
  const registry = m.contract('TraceabilityRegistry');

  return { registry };
});

export default TraceabilityRegistryModule;
