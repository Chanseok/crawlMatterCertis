import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-white dark:bg-gray-800 shadow-inner py-4 mt-10">
      <div className="container mx-auto px-4 text-center text-gray-500 dark:text-gray-400 text-sm">
        © {new Date().getFullYear()} Matter 인증 정보 수집기 - 버전 1.0
      </div>
    </footer>
  );
};
