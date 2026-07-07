import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('ocop-token')?.value;
  const { pathname } = request.nextUrl;

  // 1. Nếu chưa đăng nhập và truy cập trang bảo vệ (dashboard, profile)
  if (!token && (pathname.startsWith('/dashboard') || pathname.startsWith('/profile'))) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 2. Nếu đã đăng nhập và truy cập các trang đăng ký/đăng nhập
  if (token && (pathname.startsWith('/login') || pathname.startsWith('/register'))) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

// Chỉ định các matcher cần lọc
export const config = {
  matcher: ['/dashboard/:path*', '/profile/:path*', '/login', '/register'],
};
