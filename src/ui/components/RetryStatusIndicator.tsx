import React from 'react';
import { useStore } from '@nanostores/react';
import { crawlingProgressStore } from '../stores';

interface RetryStatusIndicatorProps {
  className?: string;
}

/**
 * 크롤링 중 재시도 과정의 상태를 표시하는 컴포넌트
 * 재시도가 발생할 때만 표시됨
 */
export const RetryStatusIndicator: React.FC<RetryStatusIndicatorProps> = React.memo(({ className }) => {
  const progress = useStore(crawlingProgressStore);
  
  // 현재 단계에 따라 재시도 정보 결정
  const currentRetry = progress.retryCount || 0;
  const maxRetries = progress.maxRetries || 0;
  const itemId = progress.retryItem || '';
  const stageName = progress.currentStage === 1 ? '제품 목록' : '제품 상세';
  
  // 재시도 중인 경우에만 표시
  if (currentRetry === 0 || maxRetries === 0) {
    return null;
  }
  
  return (
    <div className={`bg-yellow-50 dark:bg-yellow-900/30 rounded-md p-3 ${className}`}>
      <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-300 mb-1 flex items-center">
        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        재시도 진행 상황
      </h3>
      <div className="text-xs text-yellow-700 dark:text-yellow-200">
        <p className="mb-1">{stageName} 수집 재시도 중</p>
        <div className="flex items-center justify-between">
          <span>진행: {currentRetry}/{maxRetries} 회</span>
          {itemId && (
            <span className="text-right font-mono bg-yellow-100 dark:bg-yellow-800/50 px-1.5 py-0.5 rounded">
              ID: {itemId.length > 8 ? `${itemId.substring(0, 8)}...` : itemId}
            </span>
          )}
        </div>
        {/* 진행 상태 시각적 표시 */}
        <div className="mt-2 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
          <div 
            className="bg-yellow-400 dark:bg-yellow-500 h-full rounded-full animate-pulse"
            style={{ width: `${(currentRetry / maxRetries) * 100}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
});
