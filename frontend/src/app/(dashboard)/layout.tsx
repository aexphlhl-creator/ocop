import React from 'react';
import Header from '../../components/layout/header';
import Sidebar from '../../components/layout/sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <div className="flex flex-row flex-grow">
        <Sidebar />
        <main className="flex-grow p-6 bg-slate-50/50 h-[calc(100vh-64px)] overflow-y-auto">
          {children}
        </main>
      </div>
    </>
  );
}
