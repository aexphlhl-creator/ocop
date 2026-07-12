import { Prisma } from '@prisma/client';
import { BlockchainJobType } from '../blockchain.queue';

export interface CertificateRecordJobData {
  type: BlockchainJobType.CERTIFICATE_RECORD;
  certificateId: string;
  productId: string;
  batchId?: string | null;
  documentHash: string;
  actorId: string;
  reqId?: string;
}

export interface SupplyChainRecordJobData {
  type: BlockchainJobType.SUPPLY_CHAIN_RECORD;
  journeyId: string;
  productId: string;
  batchId: string;
  payload: Prisma.InputJsonObject;
  actorId: string;
  reqId?: string;
}

export type BlockchainJobData = CertificateRecordJobData | SupplyChainRecordJobData;

export interface BlockchainJobResponseDto {
  id: string;
  type: BlockchainJobType | string;
  status: string;
  attempts: number;
  createdAt: number | null;
  processedAt: number | null;
  finishedAt: number | null;
  failedReason: string | null;
  txHash: string | null;
  blockNumber: string | null;
  blockchainStatus: string | null;
  explorerUrl: string | null;
  receipt: Record<string, unknown> | null;
  gasUsed: string | null;
  confirmations: number | null;
}

export interface BlockchainJobsResponseDto {
  waiting: BlockchainJobResponseDto[];
  active: BlockchainJobResponseDto[];
  completed: BlockchainJobResponseDto[];
  failed: BlockchainJobResponseDto[];
}

export interface BlockchainDashboardResponseDto {
  waitingJobs: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  retryJobs: number;
}
