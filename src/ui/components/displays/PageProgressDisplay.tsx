/**
 * PageProgressDisplay.tsx
 * Clean Architecture Display Component
 * Single Responsibility: Display page progress tracking
 */

import React from 'react';
import { observer } from 'mobx-react-lite';
import { useCrawlingStore } from '../../hooks/useCrawlingStore';

export const PageProgressDisplay: React.FC = observer(() => {
  const { progress, status } = useCrawlingStore();
  
  const currentPage = progress?.currentPage || 0;
  const totalPages = progress?.totalPages || 0;
  const currentStage = progress?.currentStage || 0;
  
  // 1단계와 3단계(완료)에서는 보라색 테마 사용
  const isPurpleTheme = currentStage === 1 || currentStage === 3 || status === 'completed';
  
  if (status === 'idle' || totalPages === 0) {
    return null;
  }

  const percentage = totalPages > 0 ? (currentPage / totalPages) * 100 : 0;

  return (
    <div className={`mt-4 p-3 rounded-lg ${
      isPurpleTheme 
        ? 'bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800' 
        : 'bg-gray-50 dark:bg-gray-700'
    }`}>
      <div className="flex justify-between items-center mb-2">
        <span className={`text-sm font-medium ${
          isPurpleTheme 
            ? 'text-purple-700 dark:text-purple-300' 
            : 'text-gray-700 dark:text-gray-300'
        }`}>
          페이지 진행률 ({currentStage}단계)
        </span>
        <span className={`text-sm ${
          isPurpleTheme 
            ? 'text-purple-500 dark:text-purple-400' 
            : 'text-gray-500 dark:text-gray-400'
        }`}>
          {currentPage} / {totalPages}
        </span>
      </div>
      
      <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${
            status === 'completed' ? 'bg-purple-500' : 
            status === 'error' ? 'bg-red-500' : 
            isPurpleTheme ? 'bg-purple-500' : 'bg-blue-500'
          }`}
          style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
        />
      </div>
      
      <div className={`flex justify-between text-xs mt-1 ${
        isPurpleTheme 
          ? 'text-purple-500 dark:text-purple-400' 
          : 'text-gray-500 dark:text-gray-400'
      }`}>
        <span>{Math.round(percentage)}% 완료</span>
        <span>
          {totalPages - currentPage > 0 ? `${totalPages - currentPage}페이지 남음` : '완료'}
        </span>
      </div>
    </div>
  );
});
