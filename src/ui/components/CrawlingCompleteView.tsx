import { useDatabaseStore } from '../hooks/useDatabaseStore';
import { useCrawlingStore } from '../hooks/useCrawlingStore';
import type { MatterProduct } from '../../../types';

interface CrawlingCompleteViewProps {
  products: MatterProduct[];
  autoSavedToDb?: boolean;
  isSavingToDb?: boolean;
}

/**
 * 크롤링 완료 후 수집된 제품 정보를 표시하고
 * 자동 DB 저장이 꺼져 있는 경우 수동으로 DB에 저장할 수 있는 UI 제공
 */
export function CrawlingCompleteView({ products, autoSavedToDb, isSavingToDb = false }: CrawlingCompleteViewProps) {
  const { config } = useCrawlingStore();
  const { isSaving, saveResult, saveProducts, clearSaveResult } = useDatabaseStore();
  
  // 자동 DB 저장 꺼져 있는지 확인
  const isAutoSaveDisabled = config.autoAddToLocalDB === false;

  // 수집된 제품 정보 DB에 저장
  const handleSaveToDB = async () => {
    if (products.length === 0) return;
    
    try {
      await saveProducts(products);
    } catch (error) {
      console.error('Failed to save products:', error);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white">수집 결과</h2>
        
        {/* 자동 저장 여부에 따라 배지 표시 */}
        {isSavingToDb ? (
          <span className="flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
            <svg className="animate-spin -ml-0.5 mr-1.5 h-3 w-3 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            DB 저장 중
          </span>
        ) : autoSavedToDb === undefined ? (
          <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
            대기 중
          </span>
        ) : autoSavedToDb ? (
          <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
            DB 저장 완료
          </span>
        ) : (
          <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            검토 필요
          </span>
        )}
      </div>

      {/* 수집 결과 요약 */}
      <div className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="text-sm text-gray-500 dark:text-gray-400">총 수집 제품 수</div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{products.length}개</div>
          </div>
          
          {/* 자동 DB 저장 설정 상태 */}
          <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="text-sm text-gray-500 dark:text-gray-400">자동 DB 저장</div>
            <div className={`text-lg font-medium ${config.autoAddToLocalDB ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {config.autoAddToLocalDB ? '활성화' : '비활성화'}
            </div>
          </div>
          
          {/* DB 저장 상태 */}
          <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="text-sm text-gray-500 dark:text-gray-400">DB 저장 상태</div>
            <div className="text-lg font-medium">
              {isSavingToDb ? (
                <span className="flex items-center text-blue-600 dark:text-blue-400">
                  <svg className="animate-spin mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  저장 중...
                </span>
              ) : autoSavedToDb ? (
                <span className="text-green-600 dark:text-green-400">저장 완료</span>
              ) : isAutoSaveDisabled ? (
                <span className="text-amber-600 dark:text-amber-400">수동 저장 필요</span>
              ) : (
                <span className="text-gray-600 dark:text-gray-400">대기 중</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* DB에 저장 버튼 (자동 저장이 꺼져있을 때만 표시) */}
      {isAutoSaveDisabled && !autoSavedToDb && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
              <h3 className="text-lg font-medium text-blue-800 dark:text-blue-300">수동 DB 저장 필요</h3>
              <p className="text-sm text-blue-600 dark:text-blue-400">
                자동 DB 저장이 꺼져 있어 수집된 제품 정보를 수동으로 DB에 저장해야 합니다.
                저장 전에 제품 정보를 검토하고 필요한 경우 수정할 수 있습니다.
              </p>
            </div>
            <button
              onClick={handleSaveToDB}
              disabled={isSaving || products.length === 0}
              className="px-6 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 dark:disabled:bg-blue-700 
                       text-white rounded-md font-medium shadow-sm transition-colors duration-200 
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50
                       disabled:cursor-not-allowed"
            >
              {isSaving ? '저장 중...' : 'DB에 저장하기'}
            </button>
          </div>
        </div>
      )}

      {/* Error message from Save Result */}
      {saveResult && !saveResult.success && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0 mt-0.5">
              <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-300">DB 저장 중 오류가 발생했습니다</h3>
              <p className="mt-2 text-sm text-red-700 dark:text-red-400">{saveResult.message}</p>
              <div className="mt-3">
                <button
                  onClick={clearSaveResult}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 border border-red-300 dark:border-red-600 hover:border-red-400 dark:hover:border-red-500 rounded-md transition-colors"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success message from Save Result */}
      {saveResult && saveResult.success && (
        <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 rounded-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0 mt-0.5">
              <svg className="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-green-800 dark:text-green-300">제품이 성공적으로 DB에 저장되었습니다</h3>
              <p className="mt-2 text-sm text-green-700 dark:text-green-400">
                {saveResult.message || `${products.length}개의 제품이 성공적으로 저장되었습니다.`}
              </p>
              <div className="mt-3">
                <button
                  onClick={clearSaveResult}
                  className="px-3 py-1.5 text-xs font-medium text-green-600 dark:text-green-400 hover:text-green-500 dark:hover:text-green-300 border border-green-300 dark:border-green-600 hover:border-green-400 dark:hover:border-green-500 rounded-md transition-colors"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* 수집된 제품 미리보기 테이블 */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">제조사</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">모델</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">장치 유형</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">인증 ID</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">인증 날짜</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {products.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                  수집된 제품이 없습니다.
                </td>
              </tr>
            ) : (
              // 최대 5개만 미리 표시
              products.slice(0, 5).map((product) => (
                <tr key={product.url} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">{product.manufacturer}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">{product.model}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">{product.deviceType}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">{product.certificateId}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                    {product.certificationDate instanceof Date
                      ? product.certificationDate.toISOString().split('T')[0]
                      : product.certificationDate
                        ? product.certificationDate.toString().split('T')[0]
                        : '-'}
                  </td>
                </tr>
              ))
            )}
            
            {products.length > 5 && (
              <tr>
                <td colSpan={5} className="px-4 py-3 text-center text-sm text-gray-500 dark:text-gray-400">
                  ... 외 {products.length - 5}개 항목
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* 자동 저장된 경우 안내 메시지 */}
      {autoSavedToDb === true && (
        <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 rounded-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0 mt-0.5">
              <svg className="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800 dark:text-green-300">설정에 따라 제품이 자동으로 DB에 저장되었습니다</h3>
              <p className="mt-2 text-xs text-green-700 dark:text-green-400">
                수집된 모든 제품 정보가 자동으로 로컬 DB에 저장되었습니다. '로컬DB' 탭에서 저장된 제품을 확인할 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}