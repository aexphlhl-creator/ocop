import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import 'dotenv/config';

const polygonRpcUrl = process.env.POLYGON_RPC_URL ?? '';
const polygonPrivateKey = process.env.POLYGON_PRIVATE_KEY ?? '';
const polygonChainId = Number(process.env.POLYGON_CHAIN_ID ?? 80002);

const accounts = polygonPrivateKey ? [polygonPrivateKey] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.28',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    amoy: {
      url: polygonRpcUrl,
      chainId: polygonChainId,
      accounts,
    },
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
  typechain: {
    outDir: 'typechain',
    target: 'ethers-v6',
  },
};

export default config;
