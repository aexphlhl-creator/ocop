import React from 'react';
import Link from 'next/link';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-900 text-slate-400 py-12 border-t border-slate-800">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex flex-col gap-2 text-center md:text-left">
          <span className="font-extrabold text-white tracking-wide text-md">
            OCOP <span className="text-emerald-500">Việt Nam</span>
          </span>
          <p className="text-xs max-w-sm leading-relaxed text-slate-500">
            Nền tảng bản đồ số OCOP Việt Nam kết hợp thương mại điện tử - Đồng hành cùng các chủ thể nâng tầm sản phẩm Việt.
          </p>
        </div>

        <div className="flex gap-8 text-xs font-semibold">
          <Link href="/map" className="hover:text-white transition-colors">Bản đồ</Link>
          <Link href="/products" className="hover:text-white transition-colors">Sản phẩm</Link>
          <Link href="/businesses" className="hover:text-white transition-colors">Chủ thể</Link>
          <Link href="/news" className="hover:text-white transition-colors">Tin tức</Link>
        </div>

        <div className="text-center md:text-right text-[11px] text-slate-500">
          <p>© {new Date().getFullYear()} OCOP Việt Nam. Bảo lưu mọi quyền.</p>
          <p className="mt-1 text-slate-600">Phát triển bởi đội ngũ kỹ sư OCOP.</p>
        </div>
      </div>
    </footer>
  );
};
export default Footer;
