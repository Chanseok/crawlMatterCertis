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
          현재 단계:
        </span>
        {getStageBadge()}
      </div>
      
      {currentStep && (
        <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          진행 상황: {currentStep}
        </div>
      )}
    </div>
  );
};
