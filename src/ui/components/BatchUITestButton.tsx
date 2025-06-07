import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useLogStore } from '../hooks/useLogStore';

/**
 * 배치 처리 UI 테스트 버튼 컴포넌트
 * 개발 모드에서만 표시되며, 배치 처리 UI를 테스트할 수 있는 버튼을 제공합니다.
 */
export const BatchUITestButton = observer(() => {
  const [isRunning, setIsRunning] = useState(false);
  const [batchCount, setBatchCount] = useState(5);
  const [delayMs, setDelayMs] = useState(2000);
  
  const { addLog } = useLogStore();
  
  // 개발 모드 여부 확인 (단순화된 버전)
  const isDev = typeof window !== 'undefined' && 
               (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  
  // 개발 모드가 아니면 렌더링하지 않음
  if (!isDev) {
    return null;
  }
  
  // 배치 처리 UI 테스트 실행
  const handleRunTest = async () => {
    try {
      setIsRunning(true);
      addLog(`배치 처리 UI 테스트 시작: ${batchCount}개 배치, ${delayMs}ms 지연`, 'info');
      
      // IPC 호출
      const result = await window.electron.testBatchUI({ batchCount, delayMs });
      
      if (result.success) {
        addLog(result.message || '배치 처리 UI 테스트가 시작되었습니다.', 'success');
      } else {
        addLog(`테스트 시작 실패: ${result.error}`, 'error');
        setIsRunning(false);
      }
    } catch (error) {
      addLog(`테스트 시작 중 오류 발생: ${error}`, 'error');
      setIsRunning(false);
    }
  };
  
  return (
    <div className="mt-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-md border border-indigo-100 dark:border-indigo-800">
      <h3 className="text-sm font-medium text-indigo-800 dark:text-indigo-300 mb-2">배치 처리 UI 테스트 (개발 모드)</h3>
      
      <div className="flex items-center space-x-2 mb-2">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 dark:text-gray-400">배치 수 ({batchCount})</label>
          <input
            type="range"
            min="2"
            max="20"
            value={batchCount}
            onChange={(e) => setBatchCount(parseInt(e.target.value))}
            className="w-full"
            disabled={isRunning}
          />
        </div>
        
        <div className="flex-1">
          <label className="block text-xs text-gray-500 dark:text-gray-400">지연 시간 ({delayMs}ms)</label>
          <input
            type="range"
            min="500"
            max="5000"
            step="500"
            value={delayMs}
            onChange={(e) => setDelayMs(parseInt(e.target.value))}
            className="w-full"
            disabled={isRunning}
          />
        </div>
        
        <button
          onClick={handleRunTest}
          disabled={isRunning}
          className={`px-3 py-1 rounded-md text-sm font-medium focus:outline-none transition-all duration-200 ${
            isRunning
              ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-indigo-500 hover:bg-indigo-600 text-white'
          }`}
        >
          {isRunning ? '실행 중...' : '테스트 실행'}
        </button>
      </div>
      
      <p className="text-xs text-gray-500 dark:text-gray-400">
        이 테스트는 실제 크롤링 없이 배치 처리 UI만 테스트합니다. 배치 정보 표시 기능을 확인하기 위한 용도입니다.
      </p>
    </div>
  );
});
