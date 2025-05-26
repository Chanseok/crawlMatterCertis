/**
 * CrawlingMetricsDisplay.tsx
 * Clean Architecture Display Component
 * Single Responsibility: Display metrics with animated values
 */

import React from 'react';

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
  collectionStatusText: string;
  retryStatusText: string;
  progress: any;
  targetPageCount: number;
  calculatedPercentage: number;
  animatedValues: AnimatedValues;
  animatedDigits: AnimatedDigits;
  concurrentTasks: any[];
}

export const CrawlingMetricsDisplay: React.FC<CrawlingMetricsDisplayProps> = ({
  collectionStatusText,
  retryStatusText,
  progress,
  targetPageCount,
  calculatedPercentage,
  animatedValues,
  animatedDigits,
  concurrentTasks
}) => {
  const renderMetricItem = (label: string, value: any, unit: string = '', isAnimated: boolean = false) => (
    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</div>
      <div className={`text-lg font-bold text-gray-800 dark:text-gray-200 transition-all duration-300 ${
        isAnimated ? 'animate-flip' : ''
      }`}>
        {typeof value === 'number' ? Math.round(value).toLocaleString() : value}
        {unit && <span className="text-sm text-gray-500 ml-1">{unit}</span>}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Current Status Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {renderMetricItem('진행률', calculatedPercentage, '%')}
        {renderMetricItem('현재 페이지', animatedValues.currentPage, '페이지', animatedDigits.currentPage)}
        {renderMetricItem('처리된 항목', animatedValues.processedItems, '개', animatedDigits.processedItems)}
        {renderMetricItem('재시도', animatedValues.retryCount, '회', animatedDigits.retryCount)}
      </div>

      {/* Stage 2 Specific Metrics */}
      {progress.currentStage === 2 && (progress.newItems !== undefined || progress.updatedItems !== undefined) && (
        <div className="grid grid-cols-2 gap-3">
          {renderMetricItem('신규 항목', animatedValues.newItems, '개', animatedDigits.newItems)}
          {renderMetricItem('업데이트 항목', animatedValues.updatedItems, '개', animatedDigits.updatedItems)}
        </div>
      )}

      {/* Collection Status */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
        <div className="text-sm font-medium text-blue-800 dark:text-blue-300">
          {collectionStatusText}
        </div>
        {retryStatusText && (
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            {retryStatusText}
          </div>
        )}
      </div>

      {/* Target Information */}
      {targetPageCount > 0 && (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          목표 페이지: {targetPageCount.toLocaleString()}페이지
        </div>
      )}

      {/* Concurrent Tasks Info */}
      {concurrentTasks.length > 0 && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          동시 작업: {concurrentTasks.length}개
        </div>
      )}
    </div>
  );
};
