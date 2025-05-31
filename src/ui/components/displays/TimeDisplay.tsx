/**
 * TimeDisplay.tsx
 * Clean Architecture Display Component
 * Single Responsibility: Display time-related information (elapsed/remaining)
 */

import React from 'react';

interface LocalTime {
  elapsedTime: number;
  remainingTime: number;
}

interface TimeDisplayProps {
  localTime: LocalTime;
  formatDuration: (ms: number) => string;
  isBeforeStatusCheck: boolean;
  isAfterStatusCheck: boolean;
}

export const TimeDisplay: React.FC<TimeDisplayProps> = ({
  localTime,
  formatDuration,
  isBeforeStatusCheck,
  isAfterStatusCheck
}) => {
  return (
    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 mt-4">
      <div className="flex items-center justify-center gap-8">
        <div className="flex flex-col items-center">
          <span className="text-xs text-gray-500 dark:text-gray-400">경과 시간</span>
          <span className="text-lg font-bold text-gray-800 dark:text-gray-200">
            {isBeforeStatusCheck ? '00:00:00' : formatDuration(localTime.elapsedTime)}
          </span>
        </div>
        <div className="w-px h-8 bg-gray-200 dark:bg-gray-600 mx-4" />
        <div className="flex flex-col items-center">
          <span className="text-xs text-gray-500 dark:text-gray-400">예상 남은 시간</span>
          <span className="text-lg font-bold text-gray-800 dark:text-gray-200">
            {isBeforeStatusCheck ? '00:00:00' : 
             isAfterStatusCheck ? '계산 중' :
             formatDuration(localTime.remainingTime)}
          </span>
        </div>
      </div>
    </div>
  );
};


