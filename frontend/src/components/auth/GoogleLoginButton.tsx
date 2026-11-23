'use client';

import { getErrorMessage } from '@/utils/api-error';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../stores/auth.store';
import { api } from '../../services/api';
import { toast } from 'sonner';

interface GoogleLoginButtonProps {
  text?: string;
  className?: string;
}

interface GoogleCredentialResponse { credential?: string }
interface GoogleIdentityConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
}
interface GoogleButtonOptions {
  type: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'small' | 'medium' | 'large';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: number;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleIdentityConfiguration) => void;
          prompt: () => void;
          renderButton: (parent: HTMLElement, options: GoogleButtonOptions) => void;
        };
      };
    };
  }
}

export function GoogleLoginButton({
  text = 'Đăng nhập bằng Google',
  className = '',
}: GoogleLoginButtonProps) {
  const router = useRouter();
  const loginStore = useAuthStore((state) => state.login);
  const [isLoading, setIsLoading] = useState(false);
  const [isGsiLoaded, setIsGsiLoaded] = useState(false);
  const googleBtnContainerRef = useRef<HTMLDivElement>(null);

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  const handleCredentialResponse = useCallback(async (response: GoogleCredentialResponse) => {
    if (!response?.credential) {
      toast.error('Không nhận được token xác thực từ tài khoản Google.');
      return;
    }

    setIsLoading(true);
    try {
      const apiRes = await api.post('/api/v1/auth/google', {
        idToken: response.credential,
      });
      const { user, accessToken, refreshToken } = apiRes.data.data;
      loginStore(user, accessToken, refreshToken);
      toast.success(`Đăng nhập Google thành công! Xin chào ${user.fullName || user.email}`);
      router.push(user.mustChangePassword ? '/dashboard/profile' : '/dashboard');
    } catch (err: unknown) {
      const errMsg =
        getErrorMessage(err, 'Xác thực tài khoản Google với hệ thống thất bại. Vui lòng thử lại.');
      toast.error(errMsg);
    } finally {
      setIsLoading(false);
    }
  }, [loginStore, router]);

  useEffect(() => {
    if (!googleClientId) return;

    const renderGsiButton = () => {
      if (window.google?.accounts?.id) {
        setIsGsiLoaded(true);
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleCredentialResponse,
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        if (googleBtnContainerRef.current) {
          googleBtnContainerRef.current.innerHTML = '';
          window.google.accounts.id.renderButton(googleBtnContainerRef.current, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'signin_with',
            shape: 'rectangular',
            logo_alignment: 'left',
            width: 380,
          });
        }
      }
    };

    if (window.google?.accounts?.id) {
      renderGsiButton();
    } else {
      const scriptId = 'google-gsi-client';
      let script = document.getElementById(scriptId) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement('script');
        script.id = scriptId;
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = renderGsiButton;
        document.body.appendChild(script);
      } else {
        script.addEventListener('load', renderGsiButton);
      }
    }
  }, [googleClientId, handleCredentialResponse]);

  const handleClick = () => {
    if (!googleClientId) {
      toast.error(
        'Chưa có Google Client ID! Vui lòng cấu hình NEXT_PUBLIC_GOOGLE_CLIENT_ID trong file .env.local để mở cửa sổ Google thật.',
        { duration: 6000 }
      );
      return;
    }

    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    }
  };

  return (
    <div className={`w-full flex flex-col items-center ${className}`}>
      {/* Container hiển thị nút Google thật được render bởi Google Identity Services SDK */}
      <div
        ref={googleBtnContainerRef}
        className={`w-full flex justify-center [&>div]:w-full ${
          googleClientId && isGsiLoaded ? 'block' : 'hidden'
        }`}
      />

      {/* Nút fallback hiển thị khi GSI chưa render hoặc chưa cấu hình Client ID */}
      {(!googleClientId || !isGsiLoaded) && (
        <button
          type="button"
          onClick={handleClick}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-semibold text-sm shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 active:scale-[0.99] disabled:opacity-60 cursor-pointer"
        >
          {isLoading ? (
            <div className="h-5 w-5 border-2 border-slate-300 border-t-emerald-600 rounded-full animate-spin" />
          ) : (
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.25 21.36 7.34 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27a7.22 7.22 0 0 1 0-4.54V6.58H1.26a12.01 12.01 0 0 0 0 10.84l4.02-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.45-3.45C17.95 1.18 15.24 0 12 0 7.34 0 3.25 2.64 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.96 6.72-4.96z"
              />
            </svg>
          )}
          <span>{text}</span>
        </button>
      )}
    </div>
  );
}
