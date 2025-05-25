import { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
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

  const handleSave = async () => {
    try {
      console.log('handleSave called with:', {
        pageRangeLimit: pageLimit,
        productListRetryCount: productListRetry,
        productDetailRetryCount: productDetailRetry,
        autoAddToLocalDB: autoAddToDb
      });
      
      clearError();
      await updateConfig({
        pageRangeLimit: pageLimit,
        productListRetryCount: productListRetry,
        productDetailRetryCount: productDetailRetry,
        autoAddToLocalDB: autoAddToDb
      });
      
      console.log('설정이 저장되었습니다.');
      alert('설정이 저장되었습니다.'); // 사용자에게 피드백
    } catch (err) {
      console.error('설정 저장 실패:', err);
      alert('설정 저장에 실패했습니다.'); // 사용자에게 피드백
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
            max="20"
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
            max="20"
            value={productDetailRetry}
            onChange={(e) => setProductDetailRetry(Number(e.target.value))}
            disabled={isDisabled}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
        </div>

        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={autoAddToDb}
              onChange={(e) => setAutoAddToDb(e.target.checked)}
              disabled={isDisabled}
              className="mr-2"
            />
            <span className="text-sm font-medium text-gray-700">
              자동으로 로컬 DB에 추가
            </span>
          </label>
        </div>
      </div>

      {/* 저장 버튼 - 이 부분이 핵심! */}
      <div className="mt-6 flex justify-end space-x-3">
        <button
          onClick={handleSave}
          disabled={isDisabled}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          설정 저장
        </button>
      </div>
    </div>
  );
}

// Wrap with MobX observer for reactive state updates
export default observer(CrawlingSettings);