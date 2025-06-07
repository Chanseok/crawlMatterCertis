/**
 * CrawlingStageDisplay.tsx
 * Clean Architecture Display Component
 * Single Responsibility: Display stage information and badges
 */

import React from 'react';

interface CrawlingStageDisplayProps {
  getStageBadge: () => React.ReactNode;
  currentStep?: string;
}

export const CrawlingStageDisplay: React.FC<CrawlingStageDisplayProps> = ({ 
  getStageBadge, 
  currentStep 
}) => {
  return (
    <div className="mb-4">
      <div className="flex items-center space-x-3">
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
          현재 상태:
        </span>
        {getStageBadge()}
      </div>
      
      {/* 중복 정보 제거 - currentStep이 배지와 다른 유용한 정보일 때만 표시 */}
      {currentStep && currentStep !== '대기 중...' && !currentStep.includes('준비 중') && (
        <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {currentStep}
        </div>
      )}
    </div>
  );
};
