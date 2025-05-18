import React from 'react';

interface BatchProcessingSettingsProps {
  enableBatchProcessing: boolean;
  setEnableBatchProcessing: (enable: boolean) => void;
  batchSize: number;
  setBatchSize: (size: number) => void;
  batchDelayMs: number;
  setBatchDelayMs: (delay: number) => void;
  batchRetryLimit: number;
  setBatchRetryLimit: (limit: number) => void;
}

/**
 * 배치 처리 설정 컴포넌트
 * 대량의 페이지를 효율적으로 처리하기 위한 설정을 제공합니다.
 */
export const BatchProcessingSettings: React.FC<BatchProcessingSettingsProps> = ({
  enableBatchProcessing,
  setEnableBatchProcessing,
  batchSize,
  setBatchSize,
  batchDelayMs,
  setBatchDelayMs,
  batchRetryLimit,
  setBatchRetryLimit
}) => {
  return (
    <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-md border border-yellow-100 dark:border-yellow-800">
      <div className="flex items-start justify-between mb-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            배치 처리 설정
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            대량의 페이지를 수집할 때 메모리 사용을 최적화하기 위한 설정입니다.
          </p>
        </div>
        <div className="flex items-center">
          <input
            id="enable-batch"
            type="checkbox"
            className="h-5 w-5 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"
            checked={enableBatchProcessing}
            onChange={(e) => setEnableBatchProcessing(e.target.checked)}
          />
          <label htmlFor="enable-batch" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
            배치 처리 사용
          </label>
        </div>
      </div>
      
      {enableBatchProcessing && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
          {/* 배치 크기 설정 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              배치 크기 (10~100)
            </label>
            <div className="flex items-center">
              <input
                type="range"
                min="10"
                max="100"
                value={batchSize}
                onChange={(e) => setBatchSize(parseInt(e.target.value))}
                className="w-full mr-3"
              />
              <input
                type="number"
                min="10"
                max="100"
                value={batchSize}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (!isNaN(value) && value >= 10 && value <= 100) {
                    setBatchSize(value);
                  }
                }}
                className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-right"
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              한 번에 처리할 페이지 수입니다. 값이 작을수록 메모리 사용량이 감소합니다.
            </p>
          </div>
          
          {/* 배치 간 지연 설정 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              배치 간 지연 (1000~10000ms)
            </label>
            <div className="flex items-center">
              <input
                type="range"
                min="1000"
                max="10000"
                step="500"
                value={batchDelayMs}
                onChange={(e) => setBatchDelayMs(parseInt(e.target.value))}
                className="w-full mr-3"
              />
              <input
                type="number"
                min="1000"
                max="10000"
                step="500"
                value={batchDelayMs}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (!isNaN(value) && value >= 1000 && value <= 10000) {
                    setBatchDelayMs(value);
                  }
                }}
                className="w-24 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-right"
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              다음 배치 시작 전 대기 시간(ms)입니다. 값이 클수록 리소스 사용량이 감소합니다.
            </p>
          </div>
          
          {/* 배치 재시도 횟수 설정 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              배치 재시도 횟수 (1~10)
            </label>
            <div className="flex items-center">
              <input
                type="range"
                min="1"
                max="10"
                value={batchRetryLimit}
                onChange={(e) => setBatchRetryLimit(parseInt(e.target.value))}
                className="w-full mr-3"
              />
              <input
                type="number"
                min="1"
                max="10"
                value={batchRetryLimit}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (!isNaN(value) && value >= 1 && value <= 10) {
                    setBatchRetryLimit(value);
                  }
                }}
                className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-right"
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              배치 처리 실패 시 자동 재시도 횟수입니다. 네트워크 불안정 등의 일시적 오류에 대응합니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
