import type { Metadata } from 'next';
import './globals.css';
import AppProvider from '../providers/app-provider';

export const metadata: Metadata = {
  title: {
    default: 'Bản đồ số OCOP Việt Nam',
    template: '%s | OCOP Việt Nam',
  },
  description: 'Khám phá bản đồ số sản phẩm OCOP cấp Quốc gia, Tỉnh, Xã của Việt Nam và kết nối giao thương nông sản.',
  keywords: ['OCOP', 'nông sản', 'bản đồ số', 'Việt Nam', 'sản phẩm đặc sản'],
  openGraph: {
    title: 'Bản đồ số OCOP Việt Nam',
    description: 'Khám phá bản đồ số sản phẩm OCOP và kết nối giao thương nông sản.',
    locale: 'vi_VN',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      data-scroll-behavior="smooth"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <AppProvider>
          {children}
        </AppProvider>
      </body>
    </html>
  );
}
