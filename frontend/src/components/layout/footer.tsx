'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { FaGithub, FaLinkedin, FaFacebook, FaInstagram } from 'react-icons/fa';
import { Leaf, Mail, Phone } from 'lucide-react';

const footerLinks = [
  {
    heading: 'Khám phá',
    links: [
      { href: '/products', label: 'Sản phẩm OCOP' },
      { href: '/businesses', label: 'Chủ thể OCOP' },
      { href: '/news', label: 'Tin tức' },
      { href: '/map', label: 'Bản đồ số' },
    ],
  },
  {
    heading: 'Hệ thống',
    links: [
      { href: '/about', label: 'Giới thiệu' },
      { href: '/contact', label: 'Liên hệ' },
    ],
  },
];

const socialLinks = [
  { href: 'https://github.com', label: 'GitHub', icon: FaGithub },
  { href: 'https://linkedin.com', label: 'LinkedIn', icon: FaLinkedin },
  { href: 'https://facebook.com', label: 'Facebook', icon: FaFacebook },
  { href: 'https://instagram.com', label: 'Instagram', icon: FaInstagram },
];

export default function Footer() {
  return (
    <motion.footer
      role="contentinfo"
      className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
    >
      <div className="mx-auto max-w-7xl px-6 py-14">
        <div className="grid gap-12 md:grid-cols-4">

          {/* Brand */}
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-2.5 group w-fit" aria-label="OCOP Việt Nam">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#16A34A] text-white shadow-sm transition-transform duration-200 group-hover:scale-105">
                <Leaf className="h-5 w-5 fill-white text-white" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-base font-bold text-slate-900 dark:text-white">OCOP Việt Nam</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">Bản đồ số sản phẩm đặc sản</span>
              </div>
            </Link>

            <p className="mt-5 max-w-sm text-sm leading-7 text-slate-500 dark:text-slate-400">
              Nền tảng kết nối sản phẩm OCOP, doanh nghiệp, hợp tác xã và người tiêu dùng trên
              toàn quốc. Số hóa hành trình nông sản Việt Nam.
            </p>

            <div className="mt-6 flex flex-col gap-2">
              <a href="mailto:contact@ocop.vn" className="flex items-center gap-2 text-sm text-slate-500 hover:text-[#16A34A] transition-colors w-fit">
                <Mail className="h-4 w-4" />
                contact@ocop.vn
              </a>
              <a href="tel:+842800000000" className="flex items-center gap-2 text-sm text-slate-500 hover:text-[#16A34A] transition-colors w-fit">
                <Phone className="h-4 w-4" />
                (028) 0000 0000
              </a>
            </div>

            <div className="mt-6 flex items-center gap-3">
              {socialLinks.map(({ href, label, icon: Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-[#16A34A] hover:border-emerald-300 dark:hover:border-emerald-700 transition-all duration-150"
                >
                  <Icon size={16} />
                </a>
              ))}
            </div>
          </div>

          {/* Nav Groups */}
          {footerLinks.map((group) => (
            <div key={group.heading}>
              <h3 className="mb-4 text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-widest">
                {group.heading}
              </h3>
              <ul className="space-y-3">
                {group.links.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-sm text-slate-500 dark:text-slate-400 hover:text-[#16A34A] dark:hover:text-emerald-400 transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-slate-100 dark:border-slate-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <p>© {new Date().getFullYear()} OCOP Việt Nam. All rights reserved.</p>
          <p>Xây dựng cho nông sản sạch Việt Nam 🇻🇳</p>
        </div>
      </div>
    </motion.footer>
  );
}