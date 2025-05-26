/**
 * CrawlingControlsDisplay.tsx
 * Clean Architecture Display Component
 * Single Responsibility: Display control buttons (start/stop/check status)
 */

import React from 'react';

interface CrawlingControlsDisplayProps {
  status: string;
  isStatusChecking: boolean;
  onCheckStatus: () => void;
  onStartCrawling: () => void;
  onStopCrawling: () => void;
}

export const CrawlingControlsDisplay: React.FC<CrawlingControlsDisplayProps> = ({
  status,
  isStatusChecking,
  onCheckStatus,
  onStartCrawling,
  onStopCrawling
}) => {
  return (
    <div className="flex space-x-2 mb-4">
      {/* Check Status Button */}
      <button
        onClick={onCheckStatus}
        disabled={isStatusChecking || status === 'running'}
        className={`px-4 py-2 rounded font-medium transition-colors ${
          isStatusChecking || status === 'running'
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-blue-500 hover:bg-blue-600 text-white'
        }`}
      >
        {isStatusChecking ? '확인 중...' : '상태 체크'}
      </button>

      {/* Start/Stop Buttons */}
      {status === 'running' ? (
        <button
          onClick={onStopCrawling}
          className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded font-medium transition-colors"
        >
          중지
        </button>
      ) : (
        <button
          onClick={onStartCrawling}
          disabled={status === 'running'}
          className={`px-4 py-2 rounded font-medium transition-colors ${
            status === 'running'
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-green-500 hover:bg-green-600 text-white'
          }`}
        >
          시작
        </button>
      )}
    </div>
  );
};
