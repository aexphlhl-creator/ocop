export interface NamedRecord { id: string; name: string }
export interface Province extends NamedRecord {
  code?: string;
  latitude?: number;
  longitude?: number;
  productCount?: number;
  _count?: { products?: number; businesses?: number; wards?: number };
}
export interface Ward extends NamedRecord { provinceId: string }
export interface OcopLevel { id: string; level: number; title: string }
export interface ProductImage { id?: string; imageUrl: string; url?: string; isPrimary?: boolean }
export interface SellerSummary {
  id: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  sellerProfile?: { displayName: string; avatarUrl?: string | null; phone?: string | null; email?: string | null; address?: string | null } | null;
}
export interface Product {
  id: string;
  name: string;
  description: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  price: number | string;
  unit: string;
  sellerId: string;
  seller?: SellerSummary;
  provinceId: string;
  wardId: string;
  categoryId: string;
  ocopLevelId: string;
  province?: Province;
  ward?: Ward;
  category?: NamedRecord;
  ocopLevel?: OcopLevel;
  images?: ProductImage[];
  latitude: number;
  longitude: number;
  videoUrl?: string | null;
  originProcess?: string | null;
  farmingProcess?: string | null;
  harvestProcess?: string | null;
  packagingProcess?: string | null;
  certificateNumber?: string | null;
  harvestDate?: string | null;
  createdAt: string;
  rejectReason?: string | null;
  viewCount?: number;
  averageRating?: number;
  reviewCount?: number;
  availableStock?: number;
}
export interface SellerProfile {
  id: string;
  sellerId: string;
  name: string;
  displayName?: string;
  taxCode?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  industry?: string | null;
  avatarUrl?: string | null;
  description?: string | null;
  province?: Province | null;
  ward?: Ward | null;
  isVerified: boolean;
  isActive?: boolean;
  seller?: SellerSummary & { isActive: boolean; email: string };
  owner?: SellerSummary & { isActive: boolean; email: string };
  productsCount?: number;
  products?: Product[];
  featuredProducts?: Array<{ id: string; name: string; image: string | null; price: number; ocopLevel: number; ocopTitle: string }>;
  createdAt: string;
}
export interface NewsArticle {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt?: string;
  summary?: string;
  thumbnailUrl?: string;
  thumbnail?: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  createdAt: string;
  publishedAt?: string | null;
  author?: { fullName: string };
}
export interface PaginationMeta { totalPages: number; totalItems?: number; total?: number; page?: number; limit?: number }
export interface ApiResponse<T> { data: T; meta?: PaginationMeta }
export type QueryParams = Record<string, string | number | boolean | undefined>;
