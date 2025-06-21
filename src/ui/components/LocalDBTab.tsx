import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useDatabaseStore } from '../hooks';
import { useCrawlingStore } from '../hooks/useCrawlingStore';
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

  // Crawling Store for status summary
  const { statusSummary } = useCrawlingStore();

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

      // 삭제 범위 초기화 - 마지막 페이지를 기본값으로 설정
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
    // 실제 데이터베이스의 최대 페이지 ID를 사용하여 초기화
    if (allProducts.length > 0) {
      const maxPageId = Math.max(...allProducts.map(p => p.pageId ?? 0));
      
      // 기본값: 마지막 페이지만 삭제하도록 설정 (사용자에게는 1-based로 표시)
      setDeleteRange({ 
        startPageId: maxPageId, 
        endPageId: maxPageId 
      });
    } else {
      // 제품이 없는 경우 기본값
      setDeleteRange({ startPageId: 0, endPageId: 0 });
    }
    setDeleteModalVisible(true);
  }, [allProducts]);

  const closeDeleteModal = useCallback(() => {
    setDeleteModalVisible(false);
  }, []);

  // 레코드 삭제 핸들러
  const handleDelete = useCallback(async () => {
    const { startPageId, endPageId } = deleteRange;
    
    // 현재 최대 페이지 ID 계산
    const currentMaxPageId = allProducts.length > 0 ? Math.max(...allProducts.map(p => p.pageId ?? 0)) : 0;
    
    // 입력 유효성 검사
    if (startPageId < 0 || endPageId < 0) {
      alert('페이지 ID는 0 이상이어야 합니다.');
      return;
    }
    
    if (startPageId > endPageId) {
      alert('시작 페이지는 종료 페이지보다 작거나 같아야 합니다.');
      return;
    }
    
    if (endPageId > currentMaxPageId) {
      alert(`입력한 종료 페이지(${endPageId + 1})가 로컬 DB의 최대 페이지(${currentMaxPageId + 1})를 초과합니다.\n\n현재 로컬 DB에는 1~${currentMaxPageId + 1}페이지의 데이터만 있습니다.`);
      return;
    }
    
    // 사용자 확인
    const pageCount = endPageId - startPageId + 1;
    const userStartPage = startPageId + 1; // 1-based for user display
    const userEndPage = endPageId + 1; // 1-based for user display
    const confirmMessage = `정말로 페이지 ${userStartPage}부터 ${userEndPage}까지 ${pageCount}개 페이지의 모든 레코드를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`;
    
    if (!confirm(confirmMessage)) {
      return;
    }
    
    try {
      console.log(`[LocalDBTab] Deleting records from pageId ${startPageId} to ${endPageId} (user pages ${userStartPage}-${userEndPage}, ${pageCount} pages)`);
      
      // 백엔드가 내림차순을 기대하므로 더 큰 값을 startPageId로, 더 작은 값을 endPageId로 전달
      const backendStartPageId = Math.max(startPageId, endPageId);
      const backendEndPageId = Math.min(startPageId, endPageId);
      
      console.log(`[LocalDBTab] Backend API call with backendStartPageId: ${backendStartPageId}, backendEndPageId: ${backendEndPageId}`);
      await deleteRecordsByPageRange(backendStartPageId, backendEndPageId);
      console.log(`[LocalDBTab] Successfully deleted records from ${pageCount} pages (user pages ${userStartPage}-${userEndPage})`);
      
      // Mark that LocalDB data has been changed
      console.log('[LocalDBTab] Setting localDB-data-changed flag');
      sessionStorage.setItem('localDB-data-changed', 'true');
      
      closeDeleteModal();
      // Reload data to reflect changes
      await loadProducts();
      await loadSummary();
      
      alert(`성공적으로 페이지 ${userStartPage}~${userEndPage} (${pageCount}개 페이지)의 레코드를 삭제했습니다.`);
    } catch (error) {
      console.error('LocalDBTab: Failed to delete records:', error);
      alert(`레코드 삭제 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`);
      closeDeleteModal();
    }
  }, [deleteRange, allProducts, deleteRecordsByPageRange, closeDeleteModal, loadProducts, loadSummary]);

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
        
        // Mark that LocalDB data has been changed
        console.log('[LocalDBTab] Setting localDB-data-changed flag after Excel import');
        sessionStorage.setItem('localDB-data-changed', 'true');
        
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

  // 최대 페이지 ID 계산 - 실제 데이터베이스의 최대 페이지 ID
  const maxPageId = useMemo(() => {
    if (allProducts.length === 0) return 0;
    const max = Math.max(...allProducts.map(p => p.pageId ?? 0));
    
    // 상태 비교 정보 (필요시 디버깅용)
    if (statusSummary && process.env.NODE_ENV === 'development') {
      const actualMaxPage = max + 1; // 1-based
      const expectedPages = Math.ceil(allProducts.length / 12);
      
      console.log(`[LocalDBTab] Page Analysis:`, {
        localMaxPage: actualMaxPage,
        localProductCount: allProducts.length,
        expectedPages: expectedPages,
        siteTotalPages: statusSummary.siteTotalPages,
        diff: statusSummary.diff
      });
    }
    
    return max;
  }, [allProducts, statusSummary]);

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
                
                <div className="flex flex-col space-y-2">
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
                  {(() => {
                    const siteTotalPages = statusSummary?.siteTotalPages || 466;
                    const localProductCount = allProducts.length;
                    const localMaxPage = maxPageId + 1;
                    const expectedPages = Math.ceil(localProductCount / 12);
                    
                    // 예상 페이지 수와 실제 최대 페이지가 다르면 누락 페이지가 있음
                    if (expectedPages > localMaxPage) {
                      return (
                        <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">
                          🚨 누락된 페이지: 예상 {expectedPages}페이지 vs 실제 {localMaxPage}페이지 (누락: {expectedPages - localMaxPage}페이지)
                        </div>
                      );
                    }
                    
                    // 사이트와 로컬 DB 페이지 수 비교
                    if (siteTotalPages > localMaxPage) {
                      return (
                        <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded">
                          ⚠️ 사이트 대비 부족: 사이트 {siteTotalPages}페이지 vs 로컬 DB {localMaxPage}페이지
                        </div>
                      );
                    }
                    
                    return null;
                  })()}
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
                {displayProducts.length}개 표시 (UI 페이지 {currentPage}/{totalPages})
                <br />
                <span className="text-xs text-blue-600 dark:text-blue-400">
                  데이터 페이지 ID 범위: 1~{maxPageId + 1}
                </span>
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
              삭제할 페이지 범위를 선택하세요. 시작 페이지부터 종료 페이지까지의 모든 레코드가 삭제됩니다.
              <br />
              <span className="text-sm text-blue-600 dark:text-blue-400">
                📊 현재 로컬 DB 실제 범위: 1 ~ {maxPageId + 1} 페이지 (총 {allProducts.length}개 제품)
              </span>
              <br />
              <span className="text-sm text-green-600 dark:text-green-400">
                💡 예상 페이지 수: {Math.ceil(allProducts.length / 12)}페이지 ({allProducts.length}개 ÷ 12개/페이지)
              </span>
              <br />
              <span className="text-sm text-amber-600 dark:text-amber-400">
                🌐 사이트 총 페이지: {statusSummary?.siteTotalPages || '?'}페이지
              </span>
              <br />
              <span className="text-sm text-red-600 dark:text-red-400">
                ⚠️ 이 작업은 되돌릴 수 없습니다!
              </span>
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  시작 페이지 (1부터 시작)
                </label>
                <input
                  type="number"
                  value={deleteRange.startPageId + 1}
                  onChange={(e) => {
                    const userValue = Number(e.target.value);
                    const pageId = userValue - 1; // Convert to 0-based
                    if (pageId >= 0 && pageId <= maxPageId) {
                      setDeleteRange(prev => ({ 
                        ...prev, 
                        startPageId: pageId,
                        // 시작 페이지가 종료 페이지보다 크면 종료 페이지도 조정
                        endPageId: Math.max(pageId, prev.endPageId)
                      }));
                    }
                  }}
                  min={1}
                  max={maxPageId + 1}
                  placeholder={`1 ~ ${maxPageId + 1}`}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  종료 페이지 (1부터 시작)
                </label>
                <input
                  type="number"
                  value={deleteRange.endPageId + 1}
                  onChange={(e) => {
                    const userValue = Number(e.target.value);
                    const pageId = userValue - 1; // Convert to 0-based
                    if (pageId >= 0 && pageId <= maxPageId) {
                      setDeleteRange(prev => ({ 
                        ...prev, 
                        endPageId: pageId,
                        // 종료 페이지가 시작 페이지보다 작으면 시작 페이지도 조정
                        startPageId: Math.min(pageId, prev.startPageId)
                      }));
                    }
                  }}
                  min={1}
                  max={maxPageId + 1}
                  placeholder={`1 ~ ${maxPageId + 1}`}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                />
              </div>

              <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-2 rounded">
                선택된 범위: 페이지 {deleteRange.startPageId + 1} ~ {deleteRange.endPageId + 1}
                ({deleteRange.endPageId - deleteRange.startPageId + 1}개 페이지)
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
