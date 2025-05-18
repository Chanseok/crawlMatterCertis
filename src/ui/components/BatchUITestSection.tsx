import { useState } from 'react';

/**
 * 배치 처리 UI 테스트 컴포넌트
 * 개발 모드에서만 표시되며, 배치 처리 UI를 테스트할 수 있는 컴포넌트를 제공합니다.
 */
export function BatchUITestSection() {
  const [isRunning, setIsRunning] = useState(false);
  const [batchCount, setBatchCount] = useState(5);
  const [delayMs, setDelayMs] = useState(2000);
  
  // 배치 UI 테스트 실행
  const handleRunTest = async () => {
    try {
      setIsRunning(true);
      
      // IPC 호출
      const result = await window.electron.testBatchUI({ batchCount, delayMs });
      
      console.log('Batch UI test result:', result);
    } catch (error) {
      console.error('Error during batch UI test:', error);
    } finally {
      // 배치 UI 테스트는 비동기로 진행되므로, 여기서는 버튼 상태만 변경
      setTimeout(() => setIsRunning(false), 3000);
    }
  };
  
  return (
    <div className="mt-6 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-md border border-indigo-100 dark:border-indigo-800">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-md font-medium text-indigo-800 dark:text-indigo-300">
            배치 처리 UI 테스트 (개발 모드)
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            개발 및 테스트 목적으로만 사용합니다.
          </p>
        </div>
      </div>
      
      <div className="mt-2 mb-2">
        <div className="flex flex-wrap gap-3 items-end mt-2">
          <div>
            <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">
              배치 수
            </label>
            <input
              type="number"
              min="2"
              max="20"
              value={batchCount}
              onChange={(e) => setBatchCount(parseInt(e.target.value) || 5)}
              className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">
              지연 시간 (ms)
            </label>
            <input
              type="number"
              min="500"
              max="10000"
              step="500"
              value={delayMs}
              onChange={(e) => setDelayMs(parseInt(e.target.value) || 2000)}
              className="w-24 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          
          <button
            onClick={handleRunTest}
            disabled={isRunning}
            className={`px-4 py-2 rounded-md text-sm font-medium focus:outline-none transition-all duration-200 ${
              isRunning
                ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-indigo-500 hover:bg-indigo-600 text-white'
            }`}
          >
            {isRunning ? '테스트 실행 중...' : '배치 UI 테스트 실행'}
          </button>
        </div>
        
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          이 테스트는 크롤링을 실제로 수행하지 않고 배치 처리 UI만 테스트합니다. 설정한 배치 수와 지연 시간에 따라 UI가 어떻게 업데이트되는지 확인할 수 있습니다.
        </p>
      </div>
    </div>
  );
}
