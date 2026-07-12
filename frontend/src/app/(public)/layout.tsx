import React from 'react';
import Header from '../../components/layout/header';
import Footer from '../../components/layout/footer';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="flex-grow w-full min-h-[calc(100vh-64px-220px)]">
        {children}
      </main>
      <Footer />
    </>
  );
}
