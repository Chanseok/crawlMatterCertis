import { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { configStore, updateConfigSettings } from '../stores';

/**
 * 크롤링 설정 컴포넌트
 * - 페이지 범위 설정
 * - 제품 목록 재시도 횟수 설정
 * - 제품 상세 재시도 횟수 설정
 * - 자동 DB 추가 설정
 * - 크롤러 타입 설정
 * - 벤더 정보 갱신 기능
 */
export function CrawlingSettings() {
  const config = useStore(configStore);
  
  // 로컬 상태 (입력값)
  const [pageLimit, setPageLimit] = useState(config.pageRangeLimit);
  const [productListRetry, setProductListRetry] = useState(config.productListRetryCount);
  const [productDetailRetry, setProductDetailRetry] = useState(config.productDetailRetryCount);
  const [autoAddToDb, setAutoAddToDb] = useState(config.autoAddToLocalDB);
  const [crawlerType, setCrawlerType] = useState(config.crawlerType || 'axios');
  
  // 벤더 정보 상태
  const [vendorRefreshing, setVendorRefreshing] = useState(false);
  const [vendorRefreshResult, setVendorRefreshResult] = useState<{
    success?: boolean;
    added?: number;
    updated?: number;
    total?: number;
    error?: string;
  } | null>(null);
  
  // 파생 상태
  const [estimatedProducts, setEstimatedProducts] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState("");
  
  // 설정이 변경되면 로컬 상태 업데이트
  useEffect(() => {
    setPageLimit(config.pageRangeLimit);
    setProductListRetry(config.productListRetryCount);
    setProductDetailRetry(config.productDetailRetryCount);
    setAutoAddToDb(config.autoAddToLocalDB);
    setCrawlerType(config.crawlerType || 'axios');
  }, [config]);
  
  // 페이지 수에 따른 예상 제품 수 및 시간 계산
  useEffect(() => {
    // 페이지당 평균 제품 수는 12개로 가정
    const productsPerPage = 12;
    const estimatedTotal = pageLimit * productsPerPage;
    setEstimatedProducts(estimatedTotal);
    
    // 페이지당 평균 처리 시간은 30초로 가정
    const secondsPerPage = 30;
    const totalSeconds = pageLimit * secondsPerPage;
    
    // 시간 포맷팅
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    let timeStr = '';
    if (hours > 0) timeStr += `${hours}시간 `;
    if (minutes > 0) timeStr += `${minutes}분 `;
    timeStr += `${seconds}초`;
    
    setEstimatedTime(timeStr);
  }, [pageLimit]);
  
  // 설정 저장
  const handleSave = async () => {
    await updateConfigSettings({
      pageRangeLimit: pageLimit,
      productListRetryCount: productListRetry,
      productDetailRetryCount: productDetailRetry,
      autoAddToLocalDB: autoAddToDb,
      crawlerType: crawlerType
    });
  };
  
  // 벤더 정보 갱신
  const handleRefreshVendors = async () => {
    setVendorRefreshing(true);
    setVendorRefreshResult(null);
    
    try {
      // 실제 벤더 정보 갱신 API 호출
      const result = await window.electron.fetchAndUpdateVendors();
      console.log('Vendor refresh result:', result);
      setVendorRefreshResult(result);
    } catch (error: any) {
      console.error('Error refreshing vendors:', error);
      setVendorRefreshResult({
        success: false,
        error: error.message
      });
    } finally {
      setVendorRefreshing(false);
    }
  };
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-4">
      <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">크롤링 설정</h2>
      
      {/* 페이지 범위 설정 */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          수집할 페이지 수 (1~500)
        </label>
        <div className="flex items-center">
          <input
            type="range"
            min="1"
            max="500"
            value={pageLimit}
            onChange={(e) => setPageLimit(parseInt(e.target.value))}
            className="w-full mr-3"
          />
          <input
            type="number"
            min="1"
            max="100"
            value={pageLimit}
            onChange={(e) => {
              const value = parseInt(e.target.value);
              if (!isNaN(value) && value >= 1 && value <= 500) {
                setPageLimit(value);
              }
            }}
            className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-right"
          />
        </div>
        <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          페이지 범위: 1 ~ {pageLimit} (1번이 최신 페이지)
        </div>
      </div>
      
      {/* 예상 정보 */}
      <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
        <div className="flex justify-between mb-1">
          <span className="text-sm text-gray-600 dark:text-gray-300">예상 수집 제품 수:</span>
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">약 {estimatedProducts}개</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-300">예상 소요 시간:</span>
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{estimatedTime}</span>
        </div>
      </div>
      
      {/* 재시도 횟수 설정 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* 제품 목록 재시도 횟수 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            1단계 기본 정보, 재시도 (3~20)
          </label>
          <input
            type="number"
            min="3"
            max="20"
            value={productListRetry}
            onChange={(e) => {
              const value = parseInt(e.target.value);
              if (!isNaN(value) && value >= 3 && value <= 20) {
                setProductListRetry(value);
              }
            }}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
          />
        </div>
        
        {/* 제품 상세 재시도 횟수 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            2단계 상세 수집, 재시도 (3~20)
          </label>
          <input
            type="number"
            min="3"
            max="20"
            value={productDetailRetry}
            onChange={(e) => {
              const value = parseInt(e.target.value);
              if (!isNaN(value) && value >= 3 && value <= 20) {
                setProductDetailRetry(value);
              }
            }}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
          />
        </div>
      </div>
      
      {/* DB 자동 저장 설정 */}
      <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-100 dark:border-blue-800">
        <div className="flex items-center justify-between">
          <div>
            <label htmlFor="auto-add-db" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              제품 정보 수집 완료 시 자동으로 DB에 저장
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              비활성화 시 수집된 제품 정보를 검토 후 DB에 수동으로 추가할 수 있습니다
            </p>
          </div>
          <div className="flex items-center">
            <input
              id="auto-add-db"
              type="checkbox"
              className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              checked={autoAddToDb}
              onChange={() => setAutoAddToDb(!autoAddToDb)}
            />
          </div>
        </div>
      </div>
      
      {/* 크롤러 타입 설정 */}
      <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-600">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          크롤링 엔진 타입
        </label>
        <div className="flex space-x-4">
          <div className="flex items-center">
            <input
              id="crawler-axios"
              type="radio"
              name="crawler-type"
              className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
              checked={crawlerType === 'axios'}
              onChange={() => setCrawlerType('axios')}
            />
            <label htmlFor="crawler-axios" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
              Axios/Cheerio <span className="text-xs text-gray-500">(가볍고 빠름, 기본값)</span>
            </label>
          </div>
          <div className="flex items-center">
            <input
              id="crawler-playwright"
              type="radio"
              name="crawler-type"
              className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
              checked={crawlerType === 'playwright'}
              onChange={() => setCrawlerType('playwright')}
            />
            <label htmlFor="crawler-playwright" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
              Playwright <span className="text-xs text-gray-500">(브라우저 기반)</span>
            </label>
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Axios/Cheerio는 가벼운 HTTP 요청을 사용하며, Playwright는 실제 브라우저를 사용합니다. 사이트가 복잡한 경우 Playwright가 더 안정적일 수 있습니다.
        </p>
      </div>
      
      {/* 벤더 정보 갱신 */}
      <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-md border border-green-100 dark:border-green-800">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              벤더 정보 갱신
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              수집된 제품의 벤더 정보를 최신 상태로 유지합니다.
            </p>
            {vendorRefreshResult && (
              <div className={`mt-2 text-xs ${
                vendorRefreshResult.success !== false
                  ? 'text-green-600 dark:text-green-400' 
                  : 'text-red-600 dark:text-red-400'
              }`}>
                {vendorRefreshResult.success !== false
                  ? `성공: ${vendorRefreshResult.added} 추가, ${vendorRefreshResult.updated} 업데이트, 총 ${vendorRefreshResult.total}건`
                  : `오류: ${vendorRefreshResult.error}`
                }
              </div>
            )}
          </div>
          <div className="flex items-center">
            <button
              onClick={handleRefreshVendors}
              disabled={vendorRefreshing}
              className={`px-3 py-1 rounded-md text-sm font-medium focus:outline-none transition-all duration-200 ${
                vendorRefreshing
                  ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-green-500 hover:bg-green-600 text-white'
              }`}
            >
              {vendorRefreshing ? '갱신 중...' : '벤더 정보 갱신'}
            </button>
          </div>
        </div>
      </div>
      
      {/* 저장 버튼 */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md"
        >
          설정 저장
        </button>
      </div>
    </div>
  );
}