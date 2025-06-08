/**
 * CompactStatusDisplay.tsx
 * Compressed status display component that combines multiple information into one row
 * 
 * This component replaces the 2-row status display with a more space-efficient 1-row layout
 */

import React, { useCallback, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { TimeUtils } from '../../shared/utils';

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
  // Memoized time formatting function using TimeUtils
  const formatTime = useCallback((ms?: number): string => {
    if (!ms || ms <= 0) return '--:--';
    return TimeUtils.formatDuration(ms);
  }, []);

  // Memoized status color function to prevent recreation
  const getStatusColor = useCallback((status: string): string => {
    switch (status) {
      case 'running': return 'text-blue-600 dark:text-blue-400';
      case 'completed': return 'text-green-600 dark:text-green-400';
      case 'error': return 'text-red-600 dark:text-red-400';
      case 'paused': return 'text-yellow-600 dark:text-yellow-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  }, []);

  // Memoized status text function to prevent recreation
  const getStatusText = useCallback((status: string): string => {
    switch (status) {
      case 'running': return '진행중';
      case 'completed': return '완료';
      case 'error': return '오류';
      case 'paused': return '일시정지';
      case 'idle': return '대기중';
      default: return status;
    }
  }, []);

  // Memoized computed values for performance
  const statusColorClass = useMemo(() => getStatusColor(crawlingStatus), [getStatusColor, crawlingStatus]);
  const statusTextDisplay = useMemo(() => getStatusText(crawlingStatus), [getStatusText, crawlingStatus]);
  const formattedTime = useMemo(() => formatTime(elapsedTime), [formatTime, elapsedTime]);
  const roundedPercentage = useMemo(() => Math.round(percentage), [percentage]);
  const progressWidth = useMemo(() => Math.min(percentage, 100), [percentage]);
  
  // Memoized stage badge styling
  const stageBadgeClass = useMemo(() => 
    currentStage === 1 || currentStage === 3 
      ? 'bg-purple-100 text-purple-700 dark:bg-purple-800 dark:text-purple-200' 
      : 'bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200',
    [currentStage]);

  const isRunning = crawlingStatus === 'running';

  return (
    <div className="bg-gradient-to-r from-gray-50 to-blue-50 dark:from-gray-700 dark:to-gray-600 rounded-lg p-4 border border-gray-200 dark:border-gray-600 shadow-sm">
      {/* Main status row - compressed into single line */}
      <div className="flex items-center justify-between text-sm">
        {/* Left section: Status and progress */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="text-gray-500 dark:text-gray-400 font-medium">상태:</span>
            <span className={`font-semibold ${statusColorClass}`}>
              {statusTextDisplay}
            </span>
          </div>
          
          {isRunning && (
            <>
              <div className="flex items-center space-x-2">
                <span className="text-gray-500 dark:text-gray-400">단계:</span>
                <span className={`font-semibold px-2 py-1 rounded-full text-xs ${stageBadgeClass}`}>
                  {currentStage}/2
                </span>
              </div>
              
              {currentStage === 1 && (
                <div className="flex items-center space-x-2">
                  <span className="text-gray-500 dark:text-gray-400">페이지:</span>
                  <span className="font-medium text-gray-700 dark:text-gray-200">{currentPage}/{totalPages}</span>
                </div>
              )}
              
              {currentStage === 2 && (
                <div className="flex items-center space-x-2">
                  <span className="text-gray-500 dark:text-gray-400">아이템:</span>
                  <span className="font-medium text-gray-700 dark:text-gray-200">{processedItems}/{totalItems}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right section: Essential info only */}
        <div className="flex items-center space-x-4">
          {isRunning && (
            <div className="flex items-center space-x-2">
              <span className="text-gray-500 dark:text-gray-400">경과:</span>
              <span className="font-mono text-sm bg-gray-100 dark:bg-gray-600 px-2 py-1 rounded">{formattedTime}</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {isRunning && (
        <div className="mt-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
              {roundedPercentage}%
            </span>
            {message && (
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">
                {message}
              </span>
            )}
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progressWidth}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
});

CompactStatusDisplay.displayName = 'CompactStatusDisplay';

export default React.memo(CompactStatusDisplay);
