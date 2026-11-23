export interface BatchSummary {
  id: string;
  batchNumber: string;
  quantity: number;
  initialQuantity: number;
  status: string;
  lifecycleStatus?: string;
  qualityStatus?: string;
  expiryDate?: string | null;
  inventory?: {
    product?: { name: string; seller?: { fullName: string; sellerProfile?: { displayName: string } | null } | null };
    warehouse?: { name: string };
  };
  journeys?: Array<{ stage?: { displayName?: string; name?: string } }>;
}
