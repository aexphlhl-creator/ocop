import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import axios from 'axios';

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  role: 'ADMIN' | 'SELLER' | 'VISITOR' | 'EVENT_COORDINATOR';
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  login: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => Promise<void>;
  refresh: (accessToken: string, refreshToken: string) => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_URL) {
  throw new Error('Production API configuration error: NEXT_PUBLIC_API_URL is required.');
}

// Helpers đồng bộ Cookie cho Middleware Next.js đọc ở Server side
function setCookie(name: string, value: string, days = 7) {
  if (typeof window === 'undefined') return;
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  const expires = '; expires=' + date.toUTCString();
  document.cookie = name + '=' + (value || '') + expires + '; path=/; SameSite=Lax';
}

function deleteCookie(name: string) {
  if (typeof window === 'undefined') return;
  document.cookie = name + '=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      login: (user, accessToken, refreshToken) => {
        set({ user, accessToken, refreshToken });
        setCookie('ocop-token', accessToken, 7); // Lưu cookie 7 ngày trùng phiên
      },
      logout: async () => {
        const token = get().refreshToken;
        if (token) {
          try {
            await axios.post(`${API_URL}/api/v1/auth/logout`, { refreshToken: token });
          } catch (err) {
            // Bỏ qua lỗi mạng khi logout
          }
        }
        set({ user: null, accessToken: null, refreshToken: null });
        deleteCookie('ocop-token');
      },
      refresh: (accessToken, refreshToken) => {
        set((state) => ({ ...state, accessToken, refreshToken }));
        setCookie('ocop-token', accessToken, 7);
      },
    }),
    {
      name: 'ocop-auth-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
