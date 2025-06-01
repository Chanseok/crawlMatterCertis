/**
 * ProgressBarDisplay.tsx
 * Clean Architecture Display Component
 * Single Responsibility: Display progress bar visualization
 */

import React from 'react';
import { observer } from 'mobx-react-lite';
import { useCrawlingStore } from '../../hooks/useCrawlingStore';

export const ProgressBarDisplay: React.FC = observer(() => {
  const { progress, status } = useCrawlingStore();
  
  const percentage = progress?.percentage || 0;
  const currentPage = progress?.currentPage || 0;
  const totalPages = progress?.totalPages || 0;
  const currentStep = progress?.currentStep || '';
  
  // Debug logging
  console.log('[ProgressBarDisplay] Rendering with:', {
    status,
    percentage,
    currentPage,
    totalPages,
    currentStep,
    progressObject: progress
  });
  
  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          진행률
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {Math.round(percentage)}%
        </span>
      </div>
      
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
        <div
          className={`h-2.5 rounded-full transition-all duration-300 ${
            status === 'completed' ? 'bg-green-500' : 
            status === 'error' ? 'bg-red-500' : 'bg-blue-500'
          }`}
          style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
        />
      </div>
      
      {totalPages > 0 && (
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
          <span>페이지: {currentPage}</span>
          <span>총: {totalPages}</span>
        </div>
      )}
      
      {currentStep && (
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
          {currentStep}
        </p>
      )}
    </div>
  );
});
