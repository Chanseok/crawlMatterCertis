/**
 * StatusDisplay.tsx
 * Clean Component: 상태 표시 전용 컴포넌트
 * 
 * 책임:
 * - 크롤링 상태의 일관된 표시
 * - Domain Store에서 데이터 직접 참조
 * - UI 렌더링만 담당
 */

import React from 'react';
import { useCrawlingStore } from '../../hooks/useCrawlingStore';

/**
 * 상태 표시 컴포넌트
 * Domain Store의 크롤링 상태를 기반으로 상태 표시
 */
export const StatusDisplay: React.FC = () => {
  const { status, progress } = useCrawlingStore();
  
  const getStatusInfo = () => {
    switch (status) {
      case 'running':
        return {
          text: '실행 중',
          color: 'text-blue-600 dark:text-blue-400',
          bgColor: 'bg-blue-100 dark:bg-blue-900/50'
        };
      case 'completed':
        return {
          text: '완료',
          color: 'text-green-600 dark:text-green-400',
          bgColor: 'bg-green-100 dark:bg-green-900/50'
        };
      case 'error':
        return {
          text: '오류',
          color: 'text-red-600 dark:text-red-400',
          bgColor: 'bg-red-100 dark:bg-red-900/50'
        };
      default:
        return {
          text: '대기',
          color: 'text-gray-600 dark:text-gray-400',
          bgColor: 'bg-gray-100 dark:bg-gray-900/50'
        };
    }
  };

  const statusInfo = getStatusInfo();
  const message = progress?.message || '';

  return (
    <div className="space-y-2">
      <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusInfo.color} ${statusInfo.bgColor}`}>
        <div className={`w-2 h-2 rounded-full mr-2 ${status === 'running' ? 'animate-pulse' : ''} ${statusInfo.color.replace('text-', 'bg-')}`} />
        {statusInfo.text}
      </div>
      
      {message && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {message}
        </p>
      )}
    </div>
  );
};
