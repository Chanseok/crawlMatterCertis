/**
 * CompactStatusDisplay.tsx
 * Compressed status display component that combines multiple information into one row
 * 
 * This component replaces the 2-row status display with a more space-efficient 1-row layout
 */

import React from 'react';
import { observer } from 'mobx-react-lite';

interface CompactStatusDisplayProps {
  crawlingStatus: string;
  currentStage: number;
  currentPage: number;
  totalPages: number;
  processedItems: number;
  totalItems: number;
  percentage: number;
  elapsedTime?: number;
  message?: string;
}

export const CompactStatusDisplay: React.FC<CompactStatusDisplayProps> = observer(({
  crawlingStatus,
  currentStage,
  currentPage,
  totalPages,
  processedItems,
  totalItems,
  percentage,
  elapsedTime,
  message
}) => {
  const formatTime = (ms?: number): string => {
    if (!ms || ms <= 0) return '--:--';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'running': return 'text-blue-600 dark:text-blue-400';
      case 'completed': return 'text-green-600 dark:text-green-400';
      case 'error': return 'text-red-600 dark:text-red-400';
      case 'paused': return 'text-yellow-600 dark:text-yellow-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getStatusText = (status: string): string => {
    switch (status) {
      case 'running': return '진행중';
      case 'completed': return '완료';
      case 'error': return '오류';
      case 'paused': return '일시정지';
      case 'idle': return '대기중';
      default: return status;
    }
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
      {/* Main status row - compressed into single line */}
      <div className="flex items-center justify-between text-sm">
        {/* Left section: Status and progress */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="text-gray-500 dark:text-gray-400">상태:</span>
            <span className={`font-medium ${getStatusColor(crawlingStatus)}`}>
              {getStatusText(crawlingStatus)}
            </span>
          </div>
          
          {crawlingStatus === 'running' && (
            <>
              <div className="flex items-center space-x-2">
                <span className="text-gray-500 dark:text-gray-400">단계:</span>
                <span className="font-medium text-blue-600 dark:text-blue-400">
                  {currentStage}/2
                </span>
              </div>
              
              {currentStage === 1 && (
                <div className="flex items-center space-x-2">
                  <span className="text-gray-500 dark:text-gray-400">페이지:</span>
                  <span className="font-medium">{currentPage}/{totalPages}</span>
                </div>
              )}
              
              {currentStage === 2 && (
                <div className="flex items-center space-x-2">
                  <span className="text-gray-500 dark:text-gray-400">아이템:</span>
                  <span className="font-medium">{processedItems}/{totalItems}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right section: Essential info only */}
        <div className="flex items-center space-x-4">
          {crawlingStatus === 'running' && (
            <div className="flex items-center space-x-2">
              <span className="text-gray-500 dark:text-gray-400">경과:</span>
              <span className="font-mono text-sm">{formatTime(elapsedTime)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {crawlingStatus === 'running' && (
        <div className="mt-2">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {Math.round(percentage)}%
            </span>
            {message && (
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">
                {message}
              </span>
            )}
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
            <div 
              className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
});
