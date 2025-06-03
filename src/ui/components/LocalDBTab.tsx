import React, { useState, useEffect, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useDatabaseStore, useCrawlingStore } from '../hooks';
import type { MatterProduct } from '../../../types';
import { format } from 'date-fns';
import { intToHexDisplay, jsonArrayToHexDisplay } from '../utils/hexDisplayUtils';

// LocalDBTab 컴포넌트
export const LocalDBTab: React.FC = observer(() => {
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
    searchProducts,
    clearError
  } = useDatabaseStore();
  
  const { config } = useCrawlingStore();
  
  // Local state
  const [displayProducts, setDisplayProducts] = useState<MatterProduct[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [maxPageId, setMaxPageId] = useState(0);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteRange, setDeleteRange] = useState({ startPageId: 0, endPageId: 0 });
  const [totalProductPages, setTotalProductPages] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  
  // Section expansion state
  const [dbSectionExpanded, setDbSectionExpanded] = useState(true);
  const [productsSectionExpanded, setProductsSectionExpanded] = useState(true);
  
  const itemsPerPage = 12; // 사이트 구조와 일치하도록 12개로 변경

  // 컴포넌트 마운트 시 초기 데이터 로드 - 전체 레코드 로딩으로 변경
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        console.log('LocalDBTab: Loading all records for optimal UX');
        // 전체 레코드 로딩 - limit 매개변수를 전달하지 않아 모든 레코드를 가져옴
        await loadAllProducts(1); // page만 전달하고 limit은 제거
        await loadSummary();
        console.log('LocalDBTab: All records loaded successfully');
      } catch (error) {
        console.error('LocalDBTab: Failed to load initial data:', error);
      }
    };
    
    loadInitialData();
  }, [loadAllProducts, loadSummary]);

  // 검색 핸들러
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      return;
    }
    
    setIsSearching(true);
    try {
      console.log('LocalDBTab: Starting search with query:', searchQuery);
      await searchProducts(searchQuery.trim()); // 전체 검색 - limit 없음
      setCurrentPage(1); // 검색 시 첫 페이지로 리셋
      console.log('LocalDBTab: Search completed successfully');
    } catch (error) {
      console.error('LocalDBTab: Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, searchProducts]);

  // 검색 초기화 핸들러
  const handleClearSearch = useCallback(async () => {
    setSearchQuery('');
    setIsSearching(true);
    try {
      console.log('LocalDBTab: Clearing search and loading all products');
      await loadAllProducts(1); // 전체 제품 다시 로딩
      setCurrentPage(1);
      console.log('LocalDBTab: Search cleared successfully');
    } catch (error) {
      console.error('LocalDBTab: Failed to clear search:', error);
    } finally {
      setIsSearching(false);
    }
  }, [loadAllProducts]);

  // 데이터베이스 요약 정보 변경 시 페이지 정보 업데이트
  useEffect(() => {
    if (dbSummary?.totalProducts) {
      const calculatedTotalPages = Math.ceil(dbSummary.totalProducts / itemsPerPage);
      setTotalPages(calculatedTotalPages > 0 ? calculatedTotalPages : 1);
      setCurrentPage(calculatedTotalPages > 0 ? calculatedTotalPages : 1);
      
      const productsPerPage = config?.productsPerPage || 12;
      setTotalProductPages(Math.ceil(dbSummary.totalProducts / productsPerPage));
    }
  }, [dbSummary?.totalProducts, config?.productsPerPage]);

  // 제품 데이터 및 현재 페이지 변경 시 표시 데이터 업데이트
  useEffect(() => {
    if (products && Array.isArray(products) && products.length > 0) {
      // 제품 정렬 (페이지ID와 인덱스 기준)
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
      
      // 현재 페이지에 표시할 제품들 계산
      const validCurrentPage = Math.min(currentPage, totalPages > 0 ? totalPages : 1);
      const pageIndexForSlicing = (totalPages > 0 ? totalPages : 1) - validCurrentPage;
      const startIndex = pageIndexForSlicing * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const pagedProducts = sortedProducts.slice(startIndex, endIndex);
      
      setDisplayProducts(pagedProducts);
      
      // maxPageId 업데이트
      if (sortedProducts.length > 0) {
        const maxId = Math.max(...sortedProducts.map(p => p.pageId ?? 0));
        setMaxPageId(maxId);
        setDeleteRange({
          startPageId: maxId,
          endPageId: maxId
        });
      }
    } else {
      setDisplayProducts([]);
      setMaxPageId(0);
      setDeleteRange({ startPageId: 0, endPageId: 0 });
    }
  }, [products, currentPage, totalPages]);

  // 제품 데이터 재로드 함수
  const loadProducts = useCallback(async () => {
    try {
      console.log('LocalDBTab: Reloading product data');
      await loadAllProducts(1, 1000);
      await loadSummary();
      console.log('LocalDBTab: Product data reloaded successfully');
    } catch (error) {
      console.error('LocalDBTab: Failed to reload product data:', error);
    }
  }, [loadAllProducts, loadSummary]);

  // 페이지 변경 핸들러
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  // 삭제 모달 관련 핸들러
  const openDeleteModal = useCallback(() => {
    setDeleteModalVisible(true);
  }, []);

  const closeDeleteModal = useCallback(() => {
    setDeleteModalVisible(false);
  }, []);

  // 레코드 삭제 핸들러
  const handleDelete = useCallback(async () => {
    const { startPageId, endPageId } = deleteRange;
    try {
      console.log(`LocalDBTab: Deleting records from page ${startPageId + 1} to ${endPageId + 1}`);
      
      await deleteRecordsByPageRange(startPageId, endPageId);
      
      console.log(`LocalDBTab: Successfully deleted records`);
      closeDeleteModal();
      await loadProducts(); // 데이터 재로드
    } catch (error) {
      console.error('LocalDBTab: Failed to delete records:', error);
      closeDeleteModal();
    }
  }, [deleteRange, deleteRecordsByPageRange, closeDeleteModal, loadProducts]);

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

  // 페이지네이션 렌더링
  const renderPagination = () => {
    if (totalPages <= 1) return null;
    
    const pages = [];
    
    // 항상 첫 페이지 표시 (높은 수부터 시작)
    pages.push(totalPages);
    
    // 현재 페이지 기준 좌우로 2페이지씩만 표시 (역순 계산)
    let startPage = Math.min(totalPages - 1, currentPage + 2);
    let endPage = Math.max(2, currentPage - 2);
    
    // 첫 페이지와 시작 페이지 사이에 간격이 있으면 ... 표시
    if (startPage < totalPages - 1) {
      pages.push('...');
    }
    
    // 중간 페이지들 추가 (역순)
    for (let i = startPage; i >= endPage; i--) {
      pages.push(i);
    }
    
    // 끝 페이지와 마지막 표시 페이지 사이에 간격이 있으면 ... 표시
    if (endPage > 2) {
      pages.push('...');
    }
    
    // 항상 마지막 페이지 표시 (1페이지가 아닌 경우)
    if (totalPages > 1) {
      pages.push(1);
    }
    
    return (
      <div className="flex justify-center items-center mt-4 space-x-2">
        {/* 맨 처음으로 버튼 (가장 높은 페이지) */}
        <button
          onClick={() => handlePageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50"
          title="맨 처음으로 (최신 데이터)"
        >
          &laquo;
        </button>
        
        {/* 이전 버튼 (숫자가 커지는 방향) */}
        <button
          onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50"
        >
          &lt;
        </button>
        
        {/* 페이지 번호들 (역순으로 표시) */}
        {pages.map((page, index) => (
          page === '...' ? (
            <span key={`ellipsis-${index}`} className="px-3 py-2">...</span>
          ) : (
            <button
              key={`page-${page}`}
              onClick={() => handlePageChange(page as number)}
              className={`px-3 py-2 rounded ${
                currentPage === page 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              {page}
            </button>
          )
        ))}
        
        {/* 다음 버튼 (숫자가 작아지는 방향) */}
        <button
          onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50"
        >
          &gt;
        </button>
        
        {/* 맨 끝으로 버튼 (가장 낮은 페이지) */}
        <button
          onClick={() => handlePageChange(1)}
          disabled={currentPage === 1}
          className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50"
          title="맨 마지막으로 (오래된 데이터)"
        >
          &raquo;
        </button>
      </div>
    );
  };

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
      {(isLoading || isSearching) && (
        <div className="mb-4 p-3 bg-blue-100 border border-blue-400 text-blue-700 rounded">
          {isSearching ? '검색 중입니다...' : '데이터를 로딩 중입니다...'}
        </div>
      )}
      
      {/* 로컬 데이터베이스 섹션 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
        <div 
          className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-750 cursor-pointer"
          onClick={() => setDbSectionExpanded(!dbSectionExpanded)}
        >
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white">로컬 데이터베이스</h2>
          <svg 
            className={`w-6 h-6 text-gray-500 transition-transform ${dbSectionExpanded ? 'transform rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        
        {/* 섹션 내용 */}
        <div 
          className="overflow-hidden transition-all duration-300"
          style={{
            maxHeight: dbSectionExpanded ? '1000px' : '0px',
            opacity: dbSectionExpanded ? 1 : 0
          }}
        >
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
                <div className="text-gray-600 dark:text-gray-400 mb-2">현재 수집된 제품 수</div>
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {dbSummary?.totalProducts?.toLocaleString() || '0'}
                </div>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
                <div className="text-gray-600 dark:text-gray-400 mb-2">총 페이지 수</div>
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {totalProductPages?.toLocaleString() || '0'}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  (페이지당 {config?.productsPerPage || 12}개 제품 기준)
                </div>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
                <div className="text-gray-600 dark:text-gray-400 mb-2">최근 업데이트</div>
                <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  {dbSummary?.lastUpdated 
                    ? format(new Date(dbSummary.lastUpdated), 'yyyy-MM-dd HH:mm') 
                    : '없음'}
                </div>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-4">
              <button
                onClick={openDeleteModal}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors duration-200 shadow-md hover:shadow-lg active:translate-y-0.5 active:shadow border border-red-700 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-opacity-50"
              >
                레코드 삭제
              </button>
              <button
                onClick={handleExportToExcel}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors duration-200 shadow-md hover:shadow-lg active:translate-y-0.5 active:shadow border border-green-700 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-50"
              >
                엑셀 내보내기
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* 수집된 제품 정보 섹션 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
        <div 
          className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-750 cursor-pointer"
          onClick={() => setProductsSectionExpanded(!productsSectionExpanded)}
        >
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white">수집된 제품 정보</h2>
          <svg 
            className={`w-6 h-6 text-gray-500 transition-transform ${productsSectionExpanded ? 'transform rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        
        {/* 섹션 내용 */}
        <div 
          className="overflow-hidden transition-all duration-300"
          style={{
            maxHeight: productsSectionExpanded ? '5000px' : '0px',
            opacity: productsSectionExpanded ? 1 : 0
          }}
        >
          <div className="p-4">
            {/* 검색 섹션 */}
            <div className="mb-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="제조사, 모델명, 인증 ID로 검색..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSearch}
                    disabled={isSearching}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {isSearching ? '검색 중...' : '검색'}
                  </button>
                  <button
                    onClick={handleClearSearch}
                    disabled={isSearching}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    초기화
                  </button>
                </div>
              </div>
            </div>
            
            {/* 제품 테이블 */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">No.</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">제조사</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">모델명</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">VID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">PID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Device Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">인증 ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">페이지 ID</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {displayProducts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {searchQuery ? '검색 결과가 없습니다.' : '제품 정보가 없습니다. 크롤링을 통해 데이터를 수집해주세요.'}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    displayProducts.map((product, _) => (
                      <tr key={`${product.pageId}-${product.indexInPage}`} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 dark:text-gray-200">
                            {(product.pageId || 0) * 12 + (product.indexInPage || 0) + 1}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 dark:text-gray-200">
                            {product.manufacturer || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <a
                            href={product.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {product.model || '-'}
                          </a>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 dark:text-gray-200 font-mono">
                            {intToHexDisplay(typeof product.vid === 'number' ? product.vid : (typeof product.vid === 'string' ? parseInt(product.vid, 10) : undefined))}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 dark:text-gray-200 font-mono">
                            {intToHexDisplay(typeof product.pid === 'number' ? product.pid : (typeof product.pid === 'string' ? parseInt(product.pid, 10) : undefined))}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 dark:text-gray-200 font-mono">
                            {jsonArrayToHexDisplay(product.primaryDeviceTypeId as string)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 dark:text-gray-200">
                            {product.certificateId || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 dark:text-gray-200">
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
                총 {products?.length?.toLocaleString() || '0'}개 항목
              </div>
              {renderPagination()}
            </div>
          </div>
        </div>
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
                    console.log(`[UI] 시작 페이지 변경 시도: ${value + 1}, 현재 endPageId: ${deleteRange.endPageId + 1}, maxPageId: ${maxPageId + 1}`);
                    // 시작 페이지는 종료 페이지보다 같거나 커야 함
                    if (value >= 0 && value >= deleteRange.endPageId && value <= maxPageId) {
                      console.log(`[UI] 시작 페이지 변경 성공`);
                      setDeleteRange(prev => ({ ...prev, startPageId: value }));
                    } else {
                      console.log(`[UI] 시작 페이지 변경 실패: 조건 미충족`);
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
                    console.log(`[UI] 종료 페이지 변경 시도: ${value + 1}, 현재 startPageId: ${deleteRange.startPageId + 1}`);
                    // 종료 페이지는 시작 페이지보다 같거나 작아야 함
                    if (value >= 0 && value <= deleteRange.startPageId) {
                      console.log(`[UI] 종료 페이지 변경 성공`);
                      setDeleteRange(prev => ({ ...prev, endPageId: value }));
                    } else {
                      console.log(`[UI] 종료 페이지 변경 실패: 조건 미충족`);
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
});
