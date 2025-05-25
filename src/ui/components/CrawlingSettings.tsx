import { useState, useEffect } from 'react';
import { useCrawlingStore } from '../hooks/useCrawlingStore';

/**
 * CrawlingSettings Component
 * Domain Store 패턴을 사용한 크롤링 설정 컴포넌트
 */
export function CrawlingSettings() {
  const { config, status, updateConfig, error, clearError } = useCrawlingStore();
  
  // 로컬 상태 (입력값)
  const [pageLimit, setPageLimit] = useState(config.pageRangeLimit);
  const [productListRetry, setProductListRetry] = useState(config.productListRetryCount);
  const [productDetailRetry, setProductDetailRetry] = useState(config.productDetailRetryCount);
  const [autoAddToDb, setAutoAddToDb] = useState(config.autoAddToLocalDB);

  // config 변경 시 로컬 상태 동기화
  useEffect(() => {
    setPageLimit(config.pageRangeLimit);
    setProductListRetry(config.productListRetryCount);
    setProductDetailRetry(config.productDetailRetryCount);
    setAutoAddToDb(config.autoAddToLocalDB);
  }, [config]);

  const handleSave = () => {
    try {
      clearError();
      updateConfig({
        pageRangeLimit: pageLimit,
        productListRetryCount: productListRetry,
        productDetailRetryCount: productDetailRetry,
        autoAddToLocalDB: autoAddToDb
      });
    } catch (err) {
      console.error('설정 저장 실패:', err);
    }
  };

  const isDisabled = status === 'running';

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">크롤링 설정</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
          <button 
            onClick={clearError}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            페이지 범위 제한
          </label>
          <input
            type="number"
            min="1"
            max="1000"
            value={pageLimit}
            onChange={(e) => setPageLimit(Number(e.target.value))}
            disabled={isDisabled}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            제품 목록 재시도 횟수
          </label>
          <input
            type="number"
            min="1"
            max="10"
            value={productListRetry}
            onChange={(e) => setProductListRetry(Number(e.target.value))}
            disabled={isDisabled}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            제품 상세 재시도 횟수
          </label>
          <input
            type="number"
            min="1"
            max="10"
            value={productDetailRetry}
            onChange={(e) => setProductDetailRetry(Number(e.target.value))}
            disabled={isDisabled}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
        </div>

        <div className="flex items-center">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={autoAddToDb}
              onChange={(e) => setAutoAddToDb(e.target.checked)}
              disabled={isDisabled}
              className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:bg-gray-100"
            />
            <span className="text-sm font-medium text-gray-700">
              자동 DB 저장
            </span>
          </label>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          disabled={isDisabled}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          설정 저장
        </button>
      </div>

      <div className="mt-4 text-sm text-gray-500">
        현재 상태: {status === 'running' ? '크롤링 중' : '대기 중'}
      </div>
    </div>
  );
}