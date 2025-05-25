/**
 * PageProgressDisplay.tsx
 * Clean Component: 페이지 진행률 표시 전용 컴포넌트
 * 
 * 책임:
 * - 페이지 진행률의 일관된 표시
 * - Domain Store에서 데이터 직접 참조
 * - UI 렌더링만 담당
 */

import React from 'react';
import { useCrawlingStore } from '../../hooks/useCrawlingStore';

/**
 * 페이지 진행률 표시 컴포넌트
 * Domain Store의 크롤링 진행 상황을 기반으로 페이지 진행률 표시
 */
export const PageProgressDisplay: React.FC = () => {
  const { progress, status } = useCrawlingStore();
  
  const currentPage = progress?.currentPage || 0;
  const totalPages = progress?.totalPages || 0;
  const percentage = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
  
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          페이지 진행률
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {currentPage} / {totalPages} ({percentage}%)
        </span>
      </div>
      
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div 
          className={`h-2 rounded-full transition-all duration-300 ${
            status === 'completed' ? 'bg-green-500' : 'bg-blue-500'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
