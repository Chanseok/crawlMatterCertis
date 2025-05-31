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
  
  const getStageText = () => {
    if (currentStage === 1) return '1단계: 페이지 수집';
    if (currentStage === 2) return '2단계: 상세 정보 수집';
    return '대기 중';
  };
  
  const getStageColor = () => {
    if (status === 'running') return 'bg-blue-100 text-blue-800';
    if (status === 'completed') return 'bg-green-100 text-green-800';
    if (status === 'error') return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-2">
      <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStageColor()}`}>
        {getStageText()}
      </div>
      
      {currentStep && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {currentStep}
        </div>
      )}
      
      {total > 0 && (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          수집 현황: {processed.toLocaleString()} / {total.toLocaleString()}
        </div>
      )}
    </div>
  );
});
