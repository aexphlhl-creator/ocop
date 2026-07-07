import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

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
  return useQuery({
    queryKey: ['myProducts'],
    queryFn: async () => {
      const response = await api.get('/api/v1/products/my');
      return response.data.data;
    },
    enabled,
    staleTime: 2 * 60 * 1000,
  });
};
