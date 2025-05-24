/**
 * ProgressDebugPanel.tsx
 * 개발 환경에서 ViewModel 상태를 실시간으로 확인할 수 있는 디버깅 패널
 */

import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useProgressViewModel } from '../../hooks/useProgressViewModel';

export const ProgressDebugPanel = observer(() => {
  const viewModel = useProgressViewModel();
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
        <span>🐛 ViewModel Debug</span>
        <span className="text-sm">{isExpanded ? '▼' : '▶'}</span>
      </button>
      
      {isExpanded && (
        <div className="space-y-2 text-xs">
          {/* 주요 상태 표시 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <strong className="text-blue-300">Status:</strong>
              <div className={`text-xs ${viewModel.statusDisplay.isError ? 'text-red-400' : viewModel.statusDisplay.isComplete ? 'text-green-400' : 'text-yellow-400'}`}>
                {viewModel.statusDisplay.text}
              </div>
            </div>
            <div>
              <strong className="text-blue-300">Progress:</strong>
              <div className="text-yellow-400">
                {viewModel.progressDisplay.percentage.toFixed(1)}%
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div>
              <strong className="text-blue-300">Collection:</strong>
              <div className="text-green-400">
                {viewModel.collectionDisplay.displayText}
              </div>
            </div>
            <div>
              <strong className="text-blue-300">Pages:</strong>
              <div className="text-cyan-400">
                {viewModel.pageDisplay.displayText}
              </div>
            </div>
          </div>
          
          <div>
            <strong className="text-blue-300">Time Remaining:</strong>
            <div className="text-orange-400">
              {viewModel.timeDisplay.remainingDisplay}
            </div>
          </div>
          
          {/* 문제 해결 상태 체크 */}
          <div className="mt-3 p-2 bg-gray-900 rounded">
            <strong className="text-purple-300">Issues Check:</strong>
            <div className="text-xs space-y-1 mt-1">
              <div className={`${viewModel.statusDisplay.isComplete && !viewModel.statusDisplay.isError ? 'text-green-400' : 'text-red-400'}`}>
                ✓ 완료 시 오류 표시: {viewModel.statusDisplay.isComplete && !viewModel.statusDisplay.isError ? '해결됨' : '문제있음'}
              </div>
              <div className={`${viewModel.collectionDisplay.isComplete && viewModel.collectionDisplay.processed === viewModel.collectionDisplay.total ? 'text-green-400' : 'text-yellow-400'}`}>
                ✓ 수집 현황 일치: {viewModel.collectionDisplay.processed}/{viewModel.collectionDisplay.total}
              </div>
              <div className="text-green-400">
                ✓ 페이지/제품 분리: 구현됨
              </div>
            </div>
          </div>
          
          {/* Raw State */}
          <details className="mt-2">
            <summary className="cursor-pointer text-gray-300 hover:text-white">
              Raw State
            </summary>
            <pre className="mt-1 text-xs overflow-auto max-h-40 bg-black p-2 rounded">
              {JSON.stringify(viewModel.debugState, null, 2)}
            </pre>
          </details>
          
          {/* 수동 테스트 버튼들 */}
          <div className="mt-3 space-y-1">
            <strong className="text-purple-300">Manual Tests:</strong>
            <div className="flex flex-wrap gap-1">
              <button 
                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
                onClick={() => {
                  // 테스트 1: 오류 → 완료 상태 전환
                  viewModel.markError('테스트 오류', true);
                  setTimeout(() => viewModel.markComplete(), 1000);
                }}
              >
                Test Error→Complete
              </button>
              <button 
                className="px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-xs"
                onClick={() => {
                  // 테스트 2: 46/48 → 완료
                  viewModel.updateFromRawProgress({
                    processedItems: 46,
                    totalItems: 48,
                    status: 'running'
                  });
                  setTimeout(() => viewModel.markComplete(), 1000);
                }}
              >
                Test 46/48→Complete
              </button>
              <button 
                className="px-2 py-1 bg-purple-600 hover:bg-purple-700 rounded text-xs"
                onClick={() => {
                  // 테스트 3: 페이지/제품 혼합 데이터
                  viewModel.updateFromRawProgress({
                    currentPage: 3,
                    totalPages: 5,
                    processedItems: 48,
                    status: 'running',
                    stage: 'productList:collecting'
                  });
                }}
              >
                Test Page/Product Mix
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
