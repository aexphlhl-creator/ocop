export interface TraceCertificate {
  certificateNumber: string;
  type: { code?: string; name: string };
  issuingOrganization: string;
  issueDate: string;
  expiryDate: string;
  status: string;
  documentHash?: string;
  files: Array<{ fileName: string; fileUrl: string }>;
}

export interface TraceEvent {
  source: string;
  stage: { name: string; displayName: string };
  time: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  actorName: string | null;
  note: string | null;
  batchNumber: string;
  blockchainVerification?: { verified?: boolean; txHash?: string | null } | null;
}

export interface TraceBatch {
  id: string; batchNumber: string; quantity: number; initialQuantity: number;
  status?: string; lifecycleStatus?: string; qualityStatus?: string;
  manufactureDate?: string | null; harvestDate?: string | null; expiryDate?: string | null;
  warehouse?: { name: string } | null;
  traceabilityVerification?: {
    fullyVerified?: boolean;
    requirements?: Array<{ key?: string; label: string; applicable: boolean; complete: boolean }>;
  };
}

export interface TraceabilityData {
  product: {
    name: string; slug?: string; code: string; description?: string;
    price: number | string; unit: string; category?: { name: string };
    ocopLevel?: { level: number; title?: string } | null;
    images: string[];
    origin?: { province?: string | null; ward?: string | null; latitude?: number | null; longitude?: number | null };
    originProcess?: string | null; farmingProcess?: string | null; packagingProcess?: string | null;
    certificateNumber?: string | null; harvestDate?: string | null;
  };
  seller?: { id: string; name: string; address?: string | null; isVerified: boolean };
  traceabilityScope: 'PRODUCT' | 'BATCH';
  traceabilityWarning?: string | null;
  batches: TraceBatch[];
  certificates: TraceCertificate[];
  supplyChainTimeline: TraceEvent[];
  summary?: {
    qualityStatus?: string | null;
    traceabilityVerification?: { fullyVerified?: boolean; qualityVerified?: boolean; blockchainVerified?: boolean };
    blockchain?: { txHash?: string | null; explorerUrl?: string | null; verified?: boolean } | null;
  };
}
