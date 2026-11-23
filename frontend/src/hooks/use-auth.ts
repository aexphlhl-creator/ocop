import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { useAuthStore, User } from '../stores/auth.store';
import { useEffect } from 'react';
import { useHydrated } from './use-hydrated';

export const useCurrentUser = () => {
  const { accessToken, logout, user } = useAuthStore();
  const mounted = useHydrated();

  const query = useQuery({
    queryKey: ['currentUser', user?.id],
    queryFn: async () => {
      const response = await api.get('/api/v1/auth/me');
      // Backend có global interceptor đóng gói trong { success: true, data: User }
      return response.data.data as User;
    },
    enabled: mounted && !!accessToken,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 phút cache
  });

  useEffect(() => {
    if (query.data) {
      useAuthStore.setState({ user: query.data });
    }
  }, [query.data]);

  useEffect(() => {
    if (query.isError) {
      logout();
    }
  }, [query.isError, logout]);

  return {
    user: mounted ? (query.data || user) : null,
    isLoading: mounted ? (query.isLoading && !!accessToken) : true,
    isAuthenticated: !!(mounted && accessToken),
    role: mounted ? (query.data?.role || user?.role) : null,
    refetch: query.refetch,
  };
};
