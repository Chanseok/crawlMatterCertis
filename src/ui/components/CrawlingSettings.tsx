import { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useCrawlingStore } from '../hooks/useCrawlingStore';
import { serviceFactory } from '../services/ServiceFactory';

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
  
  // 저장 상태 관리
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState<string>('');

  // 설정 파일 경로 상태
  const [configPath, setConfigPath] = useState<string>('');
  const [configPathError, setConfigPathError] = useState<string>('');

  // config 변경 시 로컬 상태 동기화
  useEffect(() => {
    setPageLimit(config.pageRangeLimit);
    setProductListRetry(config.productListRetryCount);
    setProductDetailRetry(config.productDetailRetryCount);
    setAutoAddToDb(config.autoAddToLocalDB);
  }, [config]);

  // 설정 파일 경로 가져오기
  useEffect(() => {
    const loadConfigPath = async () => {
      try {
        const configService = serviceFactory.getConfigurationService();
        const path = await configService.getConfigPath();
        setConfigPath(path);
        setConfigPathError('');
      } catch (err) {
        console.error('Failed to load config path:', err);
        setConfigPathError('설정 파일 경로를 가져올 수 없습니다.');
      }
    };

    loadConfigPath();
  }, []);

  // 저장 성공/실패 메시지 자동 숨김
  useEffect(() => {
    if (saveStatus === 'success' || saveStatus === 'error') {
      const timer = setTimeout(() => {
        setSaveStatus('idle');
        setSaveMessage('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [saveStatus]);

  const handleSave = async () => {
    try {
      const newConfig = {
        pageRangeLimit: pageLimit,
        productListRetryCount: productListRetry,
        productDetailRetryCount: productDetailRetry,
        autoAddToLocalDB: autoAddToDb
      };
      
      console.log('handleSave called with:', newConfig);
      
      setSaveStatus('saving');
      setSaveMessage('설정을 저장하는 중...');
      clearError();
      
      // Ensure we're sending numbers, not strings
      const parsedConfig = {
        pageRangeLimit: Number(pageLimit),
        productListRetryCount: Number(productListRetry),
        productDetailRetryCount: Number(productDetailRetry),
        autoAddToLocalDB: Boolean(autoAddToDb)
      };
      
      console.log('Sending parsed config:', parsedConfig);
      
      await updateConfig(parsedConfig);
      
      console.log('설정이 저장되었습니다.');
      setSaveStatus('success');
      setSaveMessage('설정이 성공적으로 저장되었습니다.');
    } catch (err) {
      console.error('설정 저장 실패:', err);
      setSaveStatus('error');
      setSaveMessage('설정 저장에 실패했습니다. 다시 시도해주세요.');
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

      {/* 설정 파일 정보 섹션 */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
        <h3 className="text-sm font-medium text-gray-700 mb-2">설정 파일 정보</h3>
        {configPathError ? (
          <div className="text-red-600 text-sm">{configPathError}</div>
        ) : (
          <div className="text-sm text-gray-600">
            <span className="font-medium">설정 파일 위치:</span>
            <div className="mt-1 font-mono text-xs bg-white p-2 rounded border break-all">
              {configPath || '로딩 중...'}
            </div>
          </div>
        )}
      </div>

      {/* 저장 상태 메시지 */}
      {saveStatus !== 'idle' && (
        <div className={`mb-4 p-3 rounded flex items-center ${
          saveStatus === 'saving' ? 'bg-blue-100 border border-blue-400 text-blue-700' :
          saveStatus === 'success' ? 'bg-green-100 border border-green-400 text-green-700' :
          'bg-red-100 border border-red-400 text-red-700'
        }`}>
          {saveStatus === 'saving' && (
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          {saveStatus === 'success' && <span className="mr-3">✓</span>}
          {saveStatus === 'error' && <span className="mr-3">✗</span>}
          {saveMessage}
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
          disabled={isDisabled || saveStatus === 'saving'}
          className={`px-4 py-2 rounded-md flex items-center ${
            isDisabled || saveStatus === 'saving'
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          } text-white`}
        >
          {saveStatus === 'saving' && (
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          {saveStatus === 'saving' ? '저장 중...' : '설정 저장'}
        </button>
      </div>
    </div>
  );
}

// Wrap with MobX observer for reactive state updates
export default observer(CrawlingSettings);