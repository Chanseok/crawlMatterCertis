import React from 'react';
import { Header } from './Header';
import { Footer } from './Footer';

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <Header />
      <main className="container mx-auto py-6 px-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {children}
      </main>
      <Footer />
    </div>
  );
};
