import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { 
  productsStore, 
  databaseSummaryStore,
  deleteRecordsByPageRange,
  searchProducts,
  exportToExcel,
  configStore
} from '../stores';
import type { MatterProduct } from '../../../types';
import { format } from 'date-fns';

// LocalDBTab 컴포넌트
export const LocalDBTab: React.FC = () => {
  // 상태 관리
  const products = useStore(productsStore);
  const dbSummary = useStore(databaseSummaryStore);
  const config = useStore(configStore);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(12);
  const [totalPages, setTotalPages] = useState(1);
  const [maxPageId, setMaxPageId] = useState(0);
  const [displayProducts, setDisplayProducts] = useState<MatterProduct[]>([]);
  
  // 실제 데이터베이스 통계 계산
  const [totalProductPages, setTotalProductPages] = useState(0);
  
  // 섹션 접기/펼치기 상태
  const [dbSectionExpanded, setDbSectionExpanded] = useState(true);
  const [productsSectionExpanded, setProductsSectionExpanded] = useState(true);
  
  // 삭제 모달 상태
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteRange, setDeleteRange] = useState({
    startPageId: 0,
    endPageId: 0
  });

  // 컴포넌트 마운트 시 제품 데이터 로드 및 첫 페이지 설정
  useEffect(() => {
    loadProducts().then(() => {
      // 데이터 로드 후 페이지 계산
      if (products && products.length > 0) {
        const productsPerPage = config.productsPerPage || 12;
        const calculatedTotalPages = Math.ceil(products.length / itemsPerPage);
        
        // 최신 데이터 표시를 위해 첫 페이지를 가장 큰 페이지 번호로 설정
        if (calculatedTotalPages > 0) {
          setCurrentPage(calculatedTotalPages);
          setTotalPages(calculatedTotalPages);
          setTotalProductPages(Math.ceil(products.length / productsPerPage));
        }
      }
    });
  }, []);
  
  // 페이지 변경 시 제품 데이터 필터링
  useEffect(() => {
    if (products && products.length > 0) {
      // 내림차순으로 정렬 후 현재 페이지의 제품들만 필터링
      const sortedProducts = [...products].sort((a, b) => {
        const aIndex = (a.pageId || 0) * 100 + (a.indexInPage || 0);
        const bIndex = (b.pageId || 0) * 100 + (b.indexInPage || 0);
        return bIndex - aIndex; // 내림차순 정렬
      });
      
      // 현재 페이지에 표시할 제품들 필터링
      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const pagedProducts = sortedProducts.slice(startIndex, endIndex);
      
      setDisplayProducts(pagedProducts);
      setTotalPages(Math.ceil(sortedProducts.length / itemsPerPage));
      
      // 최대 페이지 ID 찾기
      if (sortedProducts.length > 0) {
        const maxId = Math.max(...sortedProducts.map(p => p.pageId || 0));
        setMaxPageId(maxId);
        setDeleteRange({
          startPageId: maxId,
          endPageId: maxId
        });
        
        // 총 제품 페이지 수 계산 (페이지당 12개 제품 기준)
        const productsPerPage = config.productsPerPage || 12;
        setTotalProductPages(Math.ceil(sortedProducts.length / productsPerPage));
      }
    } else {
      setDisplayProducts([]);
      setTotalPages(1);
      setTotalProductPages(0);
    }
  }, [products, currentPage, itemsPerPage, config.productsPerPage]);

  // 제품 데이터 로드 함수
  const loadProducts = async () => {
    try {
      // 백엔드에서 이미 내림차순 정렬된 데이터를 가져옴
      // 더 많은 데이터를 로드하여 모든 페이지를 계산할 수 있도록 함
      await searchProducts('', 1, 5000); // 최대한 많은 데이터 로드 (백엔드에서 이미 내림차순 정렬됨)
    } catch (error) {
      console.error('제품 데이터 로딩 중 오류:', error);
    }
  };
  
  // 페이지 변경 핸들러
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };
  
  // 삭제 모달 열기
  const openDeleteModal = () => {
    setDeleteModalVisible(true);
  };
  
  // 삭제 모달 닫기
  const closeDeleteModal = () => {
    setDeleteModalVisible(false);
  };
  
  // 시작 페이지 ID 변경 핸들러
  const handleStartPageIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    // 시작 페이지 ID는 종료 페이지 ID보다 크거나 같고 최대 페이지 ID보다 작거나 같아야 함
    if (value >= deleteRange.endPageId && value <= maxPageId) {
      setDeleteRange(prev => ({ ...prev, startPageId: value }));
    }
  };
  
  // 종료 페이지 ID 변경 핸들러
  const handleEndPageIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    // 종료 페이지 ID는 시작 페이지 ID보다 작거나 같아야 함
    if (value <= deleteRange.startPageId) {
      setDeleteRange(prev => ({ ...prev, endPageId: value }));
    }
  };
  
  // 레코드 삭제 실행
  const handleDelete = async () => {
    const { startPageId, endPageId } = deleteRange;
    await deleteRecordsByPageRange(startPageId, endPageId);
    closeDeleteModal();
    // 현재 페이지가 전체 페이지 수를 초과하는 경우 1페이지로 리셋
    setCurrentPage(1);
  };
  
  // 엑셀 내보내기 핸들러
  const handleExportToExcel = async () => {
    await exportToExcel();
  };

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
    <div className="space-y-6">
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
                  {dbSummary.totalProducts?.toLocaleString() || '0'}
                </div>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
                <div className="text-gray-600 dark:text-gray-400 mb-2">총 페이지 수</div>
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {totalProductPages?.toLocaleString() || '0'}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  (페이지당 {config.productsPerPage || 12}개 제품 기준)
                </div>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
                <div className="text-gray-600 dark:text-gray-400 mb-2">최근 업데이트</div>
                <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  {dbSummary.lastUpdated 
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
            {/* 제품 테이블 */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">No.</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">제조사</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">모델명</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">인증 ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">페이지 ID</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {displayProducts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="text-sm text-gray-500 dark:text-gray-400">제품 정보가 없습니다. 크롤링을 통해 데이터를 수집해주세요.</div>
                      </td>
                    </tr>
                  ) : (
                    displayProducts.map((product, _) => (
                      <tr key={`${product.pageId}-${product.indexInPage}`} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 dark:text-gray-200">
                            {dbSummary.totalProducts - ((product.pageId || 0) * (config.productsPerPage || 12) + (product.indexInPage || 0))}
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
                  시작 페이지 ID (최대값)
                </label>
                <input
                  type="number"
                  value={deleteRange.startPageId}
                  onChange={handleStartPageIdChange}
                  min={deleteRange.endPageId}
                  max={maxPageId}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  종료 페이지 ID (최소값)
                </label>
                <input
                  type="number"
                  value={deleteRange.endPageId}
                  onChange={handleEndPageIdChange}
                  min={0}
                  max={deleteRange.startPageId}
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
    </div>
  );
};
