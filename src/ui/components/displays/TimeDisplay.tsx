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
    <div className="grid grid-cols-2 gap-3 mt-4">
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">경과 시간</div>
        <div className="text-lg font-bold text-gray-800 dark:text-gray-200">
          {isBeforeStatusCheck ? '00:00:00' : formatDuration(localTime.elapsedTime)}
        </div>
      </div>
      
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">예상 남은 시간</div>
        <div className="text-lg font-bold text-gray-800 dark:text-gray-200">
          {isBeforeStatusCheck ? '00:00:00' : 
           isAfterStatusCheck ? '계산 중' :
           formatDuration(localTime.remainingTime)}
        </div>
      </div>
    </div>
  );
};


