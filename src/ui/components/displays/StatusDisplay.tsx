/**
 * StatusDisplay.tsx
 * Clean Architecture Display Component
 * Single Responsibility: Display current status indicators
 */

import React from 'react';
import { observer } from 'mobx-react-lite';
import { useCrawlingStore } from '../../hooks/useCrawlingStore';
import { DisplayUtils } from '../../../shared/utils/DisplayUtils.js';

/**
 * 상태 표시 컴포넌트
 * Domain Store의 크롤링 상태를 기반으로 상태 표시
 */
export const StatusDisplay: React.FC = observer(() => {
  const { status, progress } = useCrawlingStore();
  
  const getStatusInfo = () => {
    const statusDisplayInfo = DisplayUtils.getStatusDisplayInfo(status);
    return {
      text: statusDisplayInfo.text,
      color: statusDisplayInfo.color,
      bgColor: statusDisplayInfo.bgColor
    };
  };

  const statusInfo = getStatusInfo();
  const message = progress?.message || '';

  return (
    <div className="space-y-2">
      <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusInfo.color} ${statusInfo.bgColor}`}>
        <div className={`w-2 h-2 rounded-full mr-2 ${status === 'running' ? 'animate-pulse' : ''} ${statusInfo.color.replace('text-', 'bg-')}`} />
        {statusInfo.text}
      </div>
      
      {message && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {message}
        </p>
      )}
    </div>
  );
});
