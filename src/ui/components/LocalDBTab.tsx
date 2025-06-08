import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useDatabaseStore } from '../hooks';
import { IPCService } from '../services/infrastructure/IPCService';
import type { MatterProduct } from '../../../types';
import { format } from 'date-fns';

// 최적화된 LocalDBTab 컴포넌트 - 전체 조회 방식
export const LocalDBTab: React.FC = React.memo(observer(() => {
  // Domain Store Hooks
  const {
    products,
    summary: dbSummary,
    isLoading,
    error: dbError,
    loadAllProducts,
    loadSummary,
    exportToExcel,
    deleteRecordsByPageRange,
    clearError
  } = useDatabaseStore();

  // Local state - 전체 조회 최적화
  const [allProducts, setAllProducts] = useState<MatterProduct[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteRange, setDeleteRange] = useState({ startPageId: 0, endPageId: 0 });

  // Section expansion state
  const [dbSectionExpanded, setDbSectionExpanded] = useState(true);
  const [productsSectionExpanded, setProductsSectionExpanded] = useState(true);

  const itemsPerPage = 12; // 사이트 구조와 일치

  // 🚀 최적화 1: 초기 데이터 로딩 - 전체 데이터를 한 번에 로드
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        console.log('LocalDBTab: Loading all products for optimal UX...');
        await loadAllProducts(); // limit 없이 전체 로딩
        await loadSummary();
        console.log('LocalDBTab: All records loaded successfully');
      } catch (error) {
        console.error('LocalDBTab: Failed to load initial data:', error);
      }
    };

    loadInitialData();
  }, [loadAllProducts, loadSummary]);

  // 🚀 최적화 2: 전체 데이터 캐싱
  useEffect(() => {
    if (products && products.length > 0) {
      console.log(`LocalDBTab: Caching ${products.length} products for client-side operations`);

      // 정렬된 전체 데이터 캐시
      const sortedProducts = [...products].sort((a, b) => {
        const aPageId = a.pageId ?? 0;
        const bPageId = b.pageId ?? 0;
        const aIndex = a.indexInPage ?? 0;
        const bIndex = b.indexInPage ?? 0;

        if (aPageId !== bPageId) {
          return bPageId - aPageId; // 페이지 ID 내림차순
        }
        return bIndex - aIndex; // 같은 페이지 내에서는 인덱스 내림차순
      });

      setAllProducts(sortedProducts);
      setCurrentPage(1); // 첫 페이지로 리셋

      // 삭제 범위 초기화
      if (sortedProducts.length > 0) {
        const maxId = Math.max(...sortedProducts.map(p => p.pageId ?? 0));
        setDeleteRange({ startPageId: maxId, endPageId: maxId });
      }
    } else {
      setAllProducts([]);
    }
  }, [products]);

  // 🚀 최적화 3: 클라이언트 측 실시간 검색 필터링
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) {
      return allProducts;
    }

    const query = searchQuery.toLowerCase();
    const filtered = allProducts.filter(product => {
      // 기본 필드 검색
      const manufacturerMatch = product.manufacturer?.toLowerCase().includes(query);
      const modelMatch = product.model?.toLowerCase().includes(query);
      
      // applicationCategories 검색 (ReadonlyArray<string>)
      let applicationCategoriesMatch = false;
      if (product.applicationCategories && Array.isArray(product.applicationCategories)) {
        applicationCategoriesMatch = product.applicationCategories.some(cat => 
          typeof cat === 'string' && cat.toLowerCase().includes(query)
        );
      }
      
      // transportInterface 검색 (string)
      let transportInterfaceMatch = false;
      if (product.transportInterface && typeof product.transportInterface === 'string') {
        transportInterfaceMatch = product.transportInterface.toLowerCase().includes(query);
      }
      
      return manufacturerMatch || modelMatch || applicationCategoriesMatch || transportInterfaceMatch;
    });

    console.log(`LocalDBTab: Real-time search filtered ${filtered.length} products from ${allProducts.length}`);
    return filtered;
  }, [allProducts, searchQuery]);

  // 🚀 최적화 4: 클라이언트 측 페이지네이션
  const { displayProducts, totalPages } = useMemo(() => {
    const total = Math.ceil(filteredProducts.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paged = filteredProducts.slice(startIndex, endIndex);

    return {
      displayProducts: paged,
      totalPages: total
    };
  }, [filteredProducts, currentPage]);

  // 검색어 변경 시 첫 페이지로 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // 실시간 검색 핸들러
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  // 검색 초기화
  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  // 페이지 변경 핸들러
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  // 데이터 재로드 함수
  const loadProducts = useCallback(async () => {
    try {
      console.log('LocalDBTab: Reloading product data');
      await loadAllProducts();
      await loadSummary();
      console.log('LocalDBTab: Product data reloaded successfully');
    } catch (error) {
      console.error('LocalDBTab: Failed to reload product data:', error);
    }
  }, [loadAllProducts, loadSummary]);

  // 삭제 모달 관련 핸들러
  const openDeleteModal = useCallback(() => {
    // UI 페이지네이션의 최대값으로 삭제 범위 초기화
    const uiMaxPage = totalPages - 1; // 0-based index
    setDeleteRange({ 
      startPageId: uiMaxPage, 
      endPageId: uiMaxPage 
    });
    setDeleteModalVisible(true);
  }, [totalPages]);

  const closeDeleteModal = useCallback(() => {
    setDeleteModalVisible(false);
  }, []);

  // 레코드 삭제 핸들러
  const handleDelete = useCallback(async () => {
    const { startPageId, endPageId } = deleteRange;
    try {
      // Note: UI shows page X, but database uses pageId X-1 (0-based)
      // We need to pass the actual pageIds to the backend
      console.log(`LocalDBTab: Deleting records from pageId ${startPageId} to ${endPageId}`);
      await deleteRecordsByPageRange(startPageId, endPageId);
      console.log(`LocalDBTab: Successfully deleted records`);
      closeDeleteModal();
      // Reload data to reflect changes
      await loadProducts();
      await loadSummary();
    } catch (error) {
      console.error('LocalDBTab: Failed to delete records:', error);
      closeDeleteModal();
    }
  }, [deleteRange, deleteRecordsByPageRange, closeDeleteModal, loadProducts, loadSummary]);

  // 엑셀 내보내기 핸들러
  const handleExportToExcel = useCallback(async () => {
    try {
      console.log('LocalDBTab: Starting Excel export');
      await exportToExcel();
      console.log('LocalDBTab: Excel export completed successfully');
    } catch (error) {
      console.error('LocalDBTab: Excel export failed:', error);
    }
  }, [exportToExcel]);

  // 엑셀 가져오기 핸들러
  const handleImportFromExcel = useCallback(async () => {
    try {
      console.log('LocalDBTab: Starting Excel import');
      
      // IPC 서비스 통해 엑셀 가져오기 호출
      const ipcService = IPCService.getInstance();
      const result = await ipcService.importFromExcel();
      
      if (result.success) {
        console.log(`LocalDBTab: Excel import completed successfully - imported ${result.importedCount} products`);
        
        // 데이터 재로드
        await loadProducts();
        await loadSummary();
        
        // 성공 메시지 표시 (옵션)
        alert(`엑셀 가져오기 성공!\n${result.importedCount}개의 제품을 가져왔습니다.`);
      } else {
        console.error('LocalDBTab: Excel import failed:', result.error);
        alert(`엑셀 가져오기 실패: ${result.error || '알 수 없는 오류'}`);
      }
      
      if (result.errors && result.errors.length > 0) {
        console.warn('LocalDBTab: Import warnings:', result.errors);
        alert(`가져오기 중 경고사항:\n${result.errors.join('\n')}`);
      }
    } catch (error) {
      console.error('LocalDBTab: Excel import failed:', error);
      alert(`엑셀 가져오기 중 오류가 발생했습니다: ${String(error)}`);
    }
  }, [loadProducts, loadSummary]);

  // 최대 페이지 ID 계산 - UI 페이지네이션과 일치
  const maxPageId = useMemo(() => {
    return totalPages > 0 ? totalPages - 1 : 0; // 0-based index로 UI와 일치
  }, [totalPages]);

  // 🚀 최적화 5: 효율적인 페이지네이션 렌더링
  const renderPagination = useCallback(() => {
    if (totalPages <= 1) return null;

    const pages = [];
    const maxVisiblePages = 7;

    if (totalPages <= maxVisiblePages) {
      // 페이지가 적으면 모두 표시
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // 페이지가 많으면 스마트 페이지네이션
      if (currentPage <= 4) {
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }

    return (
      <div className="flex justify-center items-center mt-4 space-x-2">
        <button
          onClick={() => handlePageChange(1)}
          disabled={currentPage === 1}
          className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50"
          title="첫 페이지"
        >
          &laquo;
        </button>

        <button
          onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50"
        >
          &lt;
        </button>

        {pages.map((page, index) => (
          page === '...' ? (
            <span key={`ellipsis-${index}`} className="px-3 py-2">...</span>
          ) : (
            <button
              key={`page-${page}`}
              onClick={() => handlePageChange(page as number)}
              className={`px-3 py-2 rounded ${currentPage === page
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
            >
              {page}
            </button>
          )
        ))}

        <button
          onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50"
        >
          &gt;
        </button>

        <button
          onClick={() => handlePageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50"
          title="마지막 페이지"
        >
          &raquo;
        </button>
      </div>
    );
  }, [totalPages, currentPage, handlePageChange]);

  return (
    <>
      {/* 에러 표시 */}
      {dbError && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {dbError}
          <button
            onClick={clearError}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            ✕
          </button>
        </div>
      )}

      {/* 로딩 상태 표시 */}
      {isLoading && (
        <div className="mb-4 p-3 bg-blue-100 border border-blue-400 text-blue-700 rounded">
          초기 데이터를 로딩 중입니다... (전체 {allProducts.length || 0}개 제품)
        </div>
      )}

      {/* 로컬 데이터베이스 섹션 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
        <div
          className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-750 cursor-pointer"
          onClick={() => setDbSectionExpanded(!dbSectionExpanded)}
        >
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
            로컬 데이터베이스 ⚡ 최적화됨
          </h2>
          <svg
            className={`w-5 h-5 text-gray-500 transition-transform ${dbSectionExpanded ? 'transform rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {dbSectionExpanded && (
          <div className="p-3">
            {/* 압축된 통계 정보 */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 mb-3">
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-1">
                    <span className="text-gray-600 dark:text-gray-400">캐시:</span>
                    <span className="font-semibold text-green-600 dark:text-green-400">
                      {allProducts.length.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className="text-gray-600 dark:text-gray-400">검색 결과:</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      {filteredProducts.length.toLocaleString()}
                    </span>
                    {searchQuery && (
                      <span className="text-xs text-blue-500">"{searchQuery}"</span>
                    )}
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className="text-gray-600 dark:text-gray-400">업데이트:</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {dbSummary?.lastUpdated
                        ? format(new Date(dbSummary.lastUpdated), 'MM-dd HH:mm')
                        : '없음'}
                    </span>
                  </div>
                </div>
                
                <div className="flex space-x-2">
                  <button
                    onClick={openDeleteModal}
                    className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors duration-200"
                  >
                  레코드 삭제
                  </button>
                  <button
                    onClick={handleExportToExcel}
                    className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded transition-colors duration-200"
                  >
                  엑셀 내보내기
                  </button>
                  <button
                    onClick={handleImportFromExcel}
                    className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors duration-200"
                  >
                  엑셀 가져오기
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 수집된 제품 정보 섹션 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
        <div
          className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-750 cursor-pointer"
          onClick={() => setProductsSectionExpanded(!productsSectionExpanded)}
        >
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
            수집된 제품 정보 🔍 실시간 검색
          </h2>
          <svg
            className={`w-5 h-5 text-gray-500 transition-transform ${productsSectionExpanded ? 'transform rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {productsSectionExpanded && (
          <div className="p-3">
            {/* 🚀 최적화된 실시간 검색 */}
            <div className="mb-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="실시간 검색: 제조사, 모델명, Application Categories, Transport Interface..."
                    value={searchQuery}
                    onChange={handleSearchChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={handleClearSearch}
                  className="px-3 py-2 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors duration-200"
                >
                  초기화
                </button>
              </div>
            </div>

            {/* 제품 테이블 */}
            <div className="overflow-x-auto max-w-lg mx-auto">
              <table className="w-full divide-y divide-gray-200 dark:divide-gray-700 table-fixed">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-1 py-2 w-10 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">No.</th>
                    <th className="px-1 py-2 w-16 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">제조사</th>
                    <th className="px-1 py-2 w-32 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">모델명</th>
                    <th className="px-1 py-2 w-24 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Application Categories</th>
                    <th className="px-1 py-2 w-24 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Transport Interface</th>
                    <th className="px-1 py-2 w-14 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">페이지 ID</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {displayProducts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-3 whitespace-nowrap text-center">
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {searchQuery ? '검색 결과가 없습니다.' : '제품 정보가 없습니다. 크롤링을 통해 데이터를 수집해주세요.'}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    displayProducts.map((product, idx) => (
                      <tr key={`${product.pageId}-${product.indexInPage}`} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                        <td className="px-1 py-2 w-10 whitespace-nowrap">
                          <div className="text-xs text-gray-900 dark:text-gray-200">
                            {(currentPage - 1) * itemsPerPage + idx + 1}
                          </div>
                        </td>
                        <td className="px-1 py-2 w-16 whitespace-nowrap">
                          <div className="text-xs text-gray-900 dark:text-gray-200 truncate" title={product.manufacturer || '-'}>
                            {product.manufacturer || '-'}
                          </div>
                        </td>
                        <td className="px-1 py-2 w-32 whitespace-nowrap">
                          <a
                            href={product.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline truncate block"
                          >
                            {product.model || '-'}
                          </a>
                        </td>
                        <td className="px-1 py-2 w-24 whitespace-nowrap">
                          <div className="text-xs text-gray-900 dark:text-gray-200 truncate">
                            {Array.isArray(product.applicationCategories) 
                              ? product.applicationCategories.join(', ') 
                              : (product.applicationCategories || '-')}
                          </div>
                        </td>
                        <td className="px-1 py-2 w-24 whitespace-nowrap">
                          <div className="text-xs text-gray-900 dark:text-gray-200 truncate">
                            {Array.isArray(product.transportInterface) 
                              ? product.transportInterface.join(', ') 
                              : (product.transportInterface || '-')}
                          </div>
                        </td>
                        <td className="px-1 py-2 w-14 whitespace-nowrap">
                          <div className="text-xs text-gray-900 dark:text-gray-200">
                            {product.pageId !== undefined ? product.pageId + 1 : '-'}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* 페이지네이션 */}
            <div className="flex flex-col md:flex-row justify-between items-center mt-4">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-2 md:mb-0">
                {searchQuery ? `검색된 ${filteredProducts.length}개 중 ` : `총 ${allProducts.length}개 중 `}
                {displayProducts.length}개 표시 (페이지 {currentPage}/{totalPages})
              </div>
              {renderPagination()}
            </div>
          </div>
        )}
      </div>

      {/* 레코드 삭제 모달 */}
      {deleteModalVisible && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">레코드 삭제</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              삭제할 페이지 범위를 선택하세요 (내림차순, 연속적인 페이지만 선택 가능)
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  시작 페이지 (최신)
                </label>
                <input
                  type="number"
                  value={deleteRange.startPageId + 1}
                  onChange={(e) => {
                    const value = Number(e.target.value) - 1;
                    if (value >= 0 && value >= deleteRange.endPageId && value <= maxPageId) {
                      setDeleteRange(prev => ({ ...prev, startPageId: value }));
                    }
                  }}
                  min={Math.max(1, deleteRange.endPageId + 1)}
                  max={maxPageId + 1}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  종료 페이지 (오래된)
                </label>
                <input
                  type="number"
                  value={deleteRange.endPageId + 1}
                  onChange={(e) => {
                    const value = Number(e.target.value) - 1;
                    if (value >= 0 && value <= deleteRange.startPageId) {
                      setDeleteRange(prev => ({ ...prev, endPageId: value }));
                    }
                  }}
                  min={0}
                  max={deleteRange.startPageId + 1}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                />
              </div>
            </div>

            <div className="flex justify-end mt-6 space-x-3">
              <button
                onClick={closeDeleteModal}
                className="px-4 py-2 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-200 rounded-md"
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}));

LocalDBTab.displayName = 'LocalDBTab';
