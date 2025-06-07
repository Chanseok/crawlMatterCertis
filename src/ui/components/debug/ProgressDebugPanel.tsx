/**
 * ProgressDebugPanel.tsx
 * 개발 환경에서 Domain Store 상태를 실시간으로 확인할 수 있는 디버깅 패널
 */

import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useCrawlingStore } from '../../hooks/useCrawlingStore';

export const ProgressDebugPanel: React.FC = observer(() => {
  const crawlingData = useCrawlingStore();
  const [isExpanded, setIsExpanded] = useState(false);
  
  // 개발 환경에서만 표시 (간단한 환경 체크)
  const isDev = typeof window !== 'undefined' && 
               (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  
  if (!isDev) {
    return null;
  }
  
  return (
    <div className="fixed bottom-4 right-4 bg-gray-800 text-white p-4 rounded-lg shadow-lg max-w-md z-50">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left font-bold mb-2 flex items-center justify-between hover:bg-gray-700 p-1 rounded"
      >
        <span>🐛 Domain Store Debug</span>
        <span className="text-sm">{isExpanded ? '▼' : '▶'}</span>
      </button>
      
      {isExpanded && (
        <div className="space-y-2 text-xs">
          {/* 주요 상태 표시 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <strong className="text-blue-300">Status:</strong>
              <div className={`text-xs ${
                crawlingData.status === 'error' ? 'text-red-400' : 
                crawlingData.status === 'completed' ? 'text-green-400' : 'text-yellow-400'
              }`}>
                {crawlingData.status}
              </div>
            </div>
            <div>
              <strong className="text-blue-300">Progress:</strong>
              <div className="text-yellow-400">
                {crawlingData.progress?.percentage?.toFixed(1) || 0}%
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div>
              <strong className="text-blue-300">Collection:</strong>
              <div className="text-green-400">
                {crawlingData.progress?.processedItems || 0} / {crawlingData.progress?.totalItems || 0}
              </div>
            </div>
            <div>
              <strong className="text-blue-300">Pages:</strong>
              <div className="text-cyan-400">
                {crawlingData.progress?.currentPage || 0} / {crawlingData.progress?.totalPages || 0}
              </div>
            </div>
          </div>
          
          <div>
            <strong className="text-blue-300">Current Step:</strong>
            <div className="text-orange-400">
              {crawlingData.progress?.currentStep || 'N/A'}
            </div>
          </div>
          
          {/* Domain Store State */}
          <details className="mt-2">
            <summary className="cursor-pointer text-gray-300 hover:text-white">
              Raw Store State
            </summary>
            <pre className="mt-1 text-xs overflow-auto max-h-40 bg-black p-2 rounded">
              {JSON.stringify({
                status: crawlingData.status,
                progress: crawlingData.progress,
                error: crawlingData.error
              }, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
});
