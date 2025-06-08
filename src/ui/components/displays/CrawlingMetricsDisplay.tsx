/**
 * CrawlingMetricsDisplay.tsx
 * Clean Architecture Display Component
 * Single Responsibility: Display metrics with animated values
 */

import React from 'react';
import { DisplayUtils } from '../../../shared/utils/DisplayUtils.js';

interface AnimatedValues {
  percentage: number;
  currentPage: number;
  processedItems: number;
  newItems: number;
  updatedItems: number;
  retryCount: number;
}

interface AnimatedDigits {
  currentPage: boolean;
  processedItems: boolean;
  retryCount: boolean;
  newItems: boolean;
  updatedItems: boolean;
  elapsedTime: boolean;
  remainingTime: boolean;
}

interface CrawlingMetricsDisplayProps {
  progress: any;
  animatedValues: AnimatedValues;
  animatedDigits: AnimatedDigits;
}

export const CrawlingMetricsDisplay: React.FC<CrawlingMetricsDisplayProps> = ({
  progress,
  animatedValues,
  animatedDigits
}) => {
  const renderMetricItem = (label: string, value: any, unit: string = '', isAnimated: boolean = false) => {
    // 1단계와 3단계(완료)에서는 보라색 테마 사용, 2단계는 기본 회색 테마 유지
    const isPurpleTheme = progress.currentStage === 1 || progress.currentStage === 3 || progress.status === 'completed';
    
    return (
      <div className={`${
        isPurpleTheme 
          ? 'bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800' 
          : 'bg-gray-50 dark:bg-gray-700'
      } rounded-lg p-3`}>
        <div className="flex items-center justify-between">
          <span className={`text-xs ${
            isPurpleTheme 
              ? 'text-purple-600 dark:text-purple-400' 
              : 'text-gray-500 dark:text-gray-400'
          }`}>{label}: </span>
          <span className={`text-lg font-bold ${
            isPurpleTheme 
              ? 'text-purple-800 dark:text-purple-200' 
              : 'text-gray-800 dark:text-gray-200'
          } transition-all duration-300 ${isAnimated ? 'animate-flip' : ''}`}>
            {typeof value === 'number' ? DisplayUtils.formatNumber(Math.round(value)) : value}
            {unit && <span className={`text-sm ml-1 ${
              isPurpleTheme 
                ? 'text-purple-500 dark:text-purple-400' 
                : 'text-gray-500 dark:text-gray-400'
            }`}>{unit}</span>}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Stage 2 Specific Metrics - Only show new/updated items for stage 2 */}
      {progress.currentStage === 2 && (progress.newItems !== undefined || progress.updatedItems !== undefined) && (
        <div className="grid grid-cols-2 gap-3">
          {renderMetricItem('신규', animatedValues.newItems, '개', animatedDigits.newItems)}
          {renderMetricItem('업데이트', animatedValues.updatedItems, '개', animatedDigits.updatedItems)}
        </div>
      )}
      
      {/* Only show retry count if it's greater than 0 */}
      {animatedValues.retryCount > 0 && (
        <div className="grid grid-cols-1 gap-3">
          {renderMetricItem('재시도', animatedValues.retryCount, '회', animatedDigits.retryCount)}
        </div>
      )}
    </div>
  );
};
