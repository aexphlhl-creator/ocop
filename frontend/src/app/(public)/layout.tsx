import React from 'react';
import Header from '../../components/layout/header';
import Footer from '../../components/layout/footer';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="flex-grow min-h-[calc(100vh-64px-180px)] mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
      <Footer />
    </>
  );
}
