/**
 * CollectionStatusDisplay.tsx
 * Clean Architecture Display Component
 * Single Responsibility: Display collection status information
 */

import React from 'react';
import { observer } from 'mobx-react-lite';
import { useCrawlingStore } from '../../hooks/useCrawlingStore';

export const CollectionStatusDisplay: React.FC = observer(() => {
  const { progress, status } = useCrawlingStore();
  
  const currentStage = progress?.currentStage || 0;
  const currentStep = progress?.currentStep || '';
  const processed = progress?.processedItems || 0;
  const total = progress?.totalItems || 0;
  
  // 1단계와 3단계(완료)에서는 보라색 테마 사용
  const isPurpleTheme = currentStage === 1 || currentStage === 3 || status === 'completed';
  
  const getStageText = () => {
    if (currentStage === 1) return '1단계: 페이지 수집';
    if (currentStage === 2) return '2단계: 상세 정보 수집';
    return '대기 중';
  };
  
  const getStageColor = () => {
    if (status === 'running') {
      return isPurpleTheme 
        ? 'bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800' 
        : 'bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800';
    }
    if (status === 'completed') {
      return 'bg-gradient-to-r from-purple-100 to-green-100 dark:from-purple-900/30 dark:to-green-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800';
    }
    if (status === 'error') return 'bg-gradient-to-r from-red-100 to-orange-100 dark:from-red-900/30 dark:to-orange-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800';
    return 'bg-gradient-to-r from-gray-100 to-blue-100 dark:from-gray-900/30 dark:to-blue-900/30 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-800';
  };

  return (
    <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800 shadow-sm">
      {/* 통합된 한 줄 정보 표시 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold ${getStageColor()}`}>
            {getStageText()}
          </div>
          
          {total > 0 && (
            <div className="text-sm font-medium text-blue-700 dark:text-blue-300">
              수집: <span className="font-semibold">{processed.toLocaleString()}</span> / <span className="font-semibold">{total.toLocaleString()}</span>
            </div>
          )}
        </div>
        
        {currentStep && (
          <div className="text-xs text-blue-600 dark:text-blue-400 font-medium bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded">
            {currentStep}
          </div>
        )}
      </div>
    </div>
  );
});
