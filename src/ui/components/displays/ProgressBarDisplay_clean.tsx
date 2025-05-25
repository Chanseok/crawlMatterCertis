import React from 'react';
import { useCrawlingStore } from '../../hooks/useCrawlingStore';

export const ProgressBarDisplay: React.FC = () => {
  const { progress, status } = useCrawlingStore();
  
  const percentage = progress?.percentage || 0;
  const currentStep = progress?.currentStep || '';

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          전체 진행률
        </span>
        <span className="text-sm text-gray-900 dark:text-gray-100">
          {Math.round(percentage)}%
        </span>
      </div>
      
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
        <div 
          className={`h-3 rounded-full transition-all duration-300 ${
            status === 'completed' ? 'bg-green-500' : 
            status === 'error' ? 'bg-red-500' : 'bg-blue-500'
          }`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      
      {currentStep && (
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          {currentStep}
        </p>
      )}
    </div>
  );
};

export default ProgressBarDisplay;
