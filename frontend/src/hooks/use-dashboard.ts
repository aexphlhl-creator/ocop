import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Product, ApiResponse } from '@/types/catalog';
import { useAuthStore } from '@/stores/auth.store';

export const useAdminDashboard = (enabled: boolean) => {
  return useQuery({
    queryKey: ['adminDashboard'],
    queryFn: async () => {
      const response = await api.get('/api/v1/dashboard');
      return response.data.data;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};

export const useMonthlyProducts = (enabled: boolean) => {
  return useQuery({
    queryKey: ['monthlyProducts'],
    queryFn: async () => {
      const response = await api.get('/api/v1/statistics/monthly-products');
      return response.data.data;
    },
    enabled,
    staleTime: 10 * 60 * 1000,
  });
};

export const useStatisticsOverview = () => {
  return useQuery({
    queryKey: ['statisticsOverview'],
    queryFn: async () => {
      const response = await api.get('/api/v1/statistics/overview');
      return response.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });
};

export const useProductsByOcopLevel = () => {
  return useQuery({
    queryKey: ['productsByOcopLevel'],
    queryFn: async () => {
      const response = await api.get('/api/v1/statistics/products-by-ocop-level');
      return response.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });
};

export const useProductsByCategory = () => {
  return useQuery({
    queryKey: ['productsByCategory'],
    queryFn: async () => {
      const response = await api.get('/api/v1/statistics/products-by-category');
      return response.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });
};

export const useProductsByProvince = () => {
  return useQuery({
    queryKey: ['productsByProvince'],
    queryFn: async () => {
      const response = await api.get('/api/v1/statistics/products-by-province');
      return response.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });
};

export const useMyProducts = (enabled: boolean) => {
  const userId = useAuthStore(state => state.user?.id);
  return useQuery({
    queryKey: ['myProducts', userId],
    queryFn: async () => {
      const items: Product[] = [];
      for (let page = 1; ; page++) {
        const response = await api.get<ApiResponse<Product[]>>('/api/v1/products/my', { params: { page, limit: 100 } });
        items.push(...response.data.data);
        if (page >= (response.data.meta?.totalPages ?? 1)) return items;
      }
    },
    enabled,
    staleTime: 2 * 60 * 1000,
  });
};

export const useSellerViews = (enabled: boolean) => {
  return useQuery({
    queryKey: ['sellerViews'],
    queryFn: async () => {
      const response = await api.get('/api/v1/statistics/seller-views');
      return response.data.data.views;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};

export const useRevenue = (days: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: ['revenue', days],
    queryFn: async () => {
      const response = await api.get(`/api/v1/statistics/revenue?days=${days}`);
      return response.data.data;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};

export const useOrdersStatus = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ['ordersStatus'],
    queryFn: async () => {
      const response = await api.get('/api/v1/statistics/orders-status');
      return response.data.data;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};

export const useTopProducts = (limit: number = 5, enabled: boolean = true) => {
  return useQuery({
    queryKey: ['topProducts', limit],
    queryFn: async () => {
      const response = await api.get(`/api/v1/statistics/top-products?limit=${limit}`);
      return response.data.data;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};
