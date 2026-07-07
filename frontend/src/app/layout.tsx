import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppProvider from "../providers/app-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bản đồ số OCOP Việt Nam - Hệ thống thương mại điện tử sản phẩm OCOP",
  description: "Khám phá bản đồ số sản phẩm OCOP cấp Quốc gia, Tỉnh, Xã của Việt Nam và kết nối giao thương nông sản.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50/30 text-slate-800">
        <AppProvider>
          {children}
        </AppProvider>
      </body>
    </html>
  );
}
