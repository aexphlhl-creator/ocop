// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#10B981', // Fresh Emerald
          hover:   '#059669', // Darker Emerald
          light:   '#D1FAE5', // Light Mint
          dark:    '#065F46', // Deep Forest
        },
        secondary: '#F59E0B', // Sun Yellow
        accent: {
          DEFAULT: '#B45309', // Earthy Clay
          light:   '#FEF3C7',
          dark:    '#78350F',
        },
        background: '#FAFAF8', // Soft Cream / Off-white
        foreground: '#1C2E20', // Deep Forest Green (almost black)
        surface:    '#FFFFFF',
        border:     '#E5E7EB', // Soft border
        muted:      '#6B7280',
      },
      fontFamily: {
        sans: ['var(--font-inter)', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        heading: ['var(--font-sora)', 'sans-serif'],
      },
      borderRadius: {
        sm: '0.5rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
        '4xl': '2.5rem',
      },
      boxShadow: {
        xs:  '0 2px 4px rgba(0,0,0,0.02)',
        sm:  '0 4px 12px rgba(0,0,0,0.04)',
        md:  '0 10px 25px -5px rgba(0,0,0,0.05)',
        lg:  '0 20px 40px -10px rgba(0,0,0,0.08)',
        xl:  '0 30px 60px -15px rgba(0,0,0,0.1)',
        '2xl':'0 40px 80px -20px rgba(0,0,0,0.12)',
        inner: 'inset 0 2px 4px 0 rgba(0,0,0,0.02)',
        none: 'none',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-100%)' },
        },
      },
      animation: {
        'fade-in':  'fadeIn 0.3s ease-out both',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.22, 1, 0.36, 1) both',
        'scale-in': 'scaleIn 0.3s ease-out both',
        'marquee': 'marquee 25s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
