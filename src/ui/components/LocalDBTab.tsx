import React, { useState, useEffect } from 'react';
import { useDatabaseStore, useCrawlingStore } from '../hooks';
import type { MatterProduct } from '../../../types';
import { format } from 'date-fns';
import { intToHexDisplay, jsonArrayToHexDisplay } from '../utils/hexDisplayUtils';

// LocalDBTab 컴포넌트
export const LocalDBTab: React.FC = () => {
  // Domain Store Hooks
  const { 
    products, 
    summary: dbSummary, 
    searchProducts, 
    loadSummary, 
    exportToExcel,
    deleteRecordsByPageRange
  } = useDatabaseStore();
  
  const { config } = useCrawlingStore();
  
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
      // 데이터베이스 요약 정보 기준으로 페이지 계산 (로드된 데이터 대신 총 레코드 수 사용)
      const dbTotalProducts = dbSummary?.totalProducts || 0;
      
      if (dbTotalProducts > 0) {
        const calculatedTotalPages = Math.ceil(dbTotalProducts / itemsPerPage);
        
        if (calculatedTotalPages > 0) {
          setTotalPages(calculatedTotalPages);
          // 최신 데이터 표시를 위해 첫 페이지를 가장 큰 페이지 번호로 설정
          setCurrentPage(calculatedTotalPages); 
          
          const productsPerPage = config?.productsPerPage || 12;
          setTotalProductPages(Math.ceil(dbTotalProducts / productsPerPage));
        } else {
          setTotalPages(1);
          setCurrentPage(1);
          setTotalProductPages(0);
        }
      } else {
        setTotalPages(1);
        setCurrentPage(1);
        setTotalProductPages(0);
      }
    });
  // itemsPerPage와 config.productsPerPage도 초기 로직에 영향을 줄 수 있으므로 추가
  }, [itemsPerPage, config?.productsPerPage, dbSummary?.totalProducts]);
  
  // 페이지 변경 시 제품 데이터 필터링
  useEffect(() => {
    if (products && products.length > 0) {
      console.log('[UI] 제품 정보 정렬 시작, 총 제품 수:', products.length);
      
      // 전체 제품 데이터를 내림차순으로 정렬 (pageId * 12 + indexInPage 기준)
      const sortedProducts = [...products].sort((a, b) => {
        // pageId와 indexInPage 조합으로 No. 값 계산
        const aNo = (a.pageId || 0) * 12 + (a.indexInPage || 0);
        const bNo = (b.pageId || 0) * 12 + (b.indexInPage || 0);
        return bNo - aNo; // 내림차순 정렬 (newest first)
      });
      
      // 현재 페이지에 표시할 제품들 필터링
      const currentDisplayPage = Math.min(currentPage, totalPages > 0 ? totalPages : 1);
      const pageIndexForSlicing = (totalPages > 0 ? totalPages : 1) - currentDisplayPage;
      
      const startIndex = pageIndexForSlicing * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const pagedProducts = sortedProducts.slice(startIndex, endIndex);
      
      console.log(`[UI] 현재 페이지(${currentPage} -> UI상 ${currentDisplayPage}, sliceIndex ${pageIndexForSlicing})의 제품 정보:`,
        pagedProducts.map(p => ({
          no: (p.pageId || 0) * 12 + (p.indexInPage || 0) + 1,
          pageId: p.pageId,
          indexInPage: p.indexInPage
        }))
      );
      
      setDisplayProducts(pagedProducts);
      
      // 데이터베이스의 총 레코드 수를 기준으로 페이지 계산
      const calculatedTotalPages = Math.ceil((dbSummary?.totalProducts || 0) / itemsPerPage);
      setTotalPages(calculatedTotalPages > 0 ? calculatedTotalPages : 1);
      
      if (sortedProducts.length > 0) {
        const maxId = Math.max(...sortedProducts.map(p => p.pageId || 0));
        setMaxPageId(maxId);
        setDeleteRange({
          startPageId: maxId,
          endPageId: maxId
        });
        
        const productsPerPage = config?.productsPerPage || 12;
        // 데이터베이스의 총 레코드 수 기준으로 계산
        setTotalProductPages(Math.ceil((dbSummary?.totalProducts || 0) / productsPerPage));
      }
    } else {
      setDisplayProducts([]);
      setTotalPages(1);
      setCurrentPage(1);
      setTotalProductPages(0);
      setMaxPageId(0);
    }
  }, [products, currentPage, itemsPerPage, config?.productsPerPage, totalPages, dbSummary?.totalProducts]);

  // 제품 데이터 로드 함수
  const loadProducts = async () => {
    try {
      console.log('제품 데이터 로드 시작');
      // 백엔드에서 데이터를 가져옴 (내림차순 정렬 요청)
      await searchProducts('', { page: 1, limit: 8000 }); // 8000개 데이터 로드 (5000에서 8000으로 상향)
      
      // 데이터베이스 요약 정보도 함께 갱신
      await loadSummary();
      
      console.log('제품 데이터와 데이터베이스 요약 정보 갱신 완료');
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
  
  // 레코드 삭제 실행
  const handleDelete = async () => {
    const { startPageId, endPageId } = deleteRange;
    try {
      console.log(`[UI] 레코드 삭제 요청: 페이지 범위 ${startPageId+1}~${endPageId+1}, 실제 pageId: ${startPageId}~${endPageId}`);
      console.log(`[UI] 삭제 전 상태 - maxPageId: ${maxPageId}, 현재 페이지: ${currentPage}, 총 페이지: ${totalPages}`);
      console.log(`[UI] 제품 수: ${products?.length}`);
      
      // 레코드 삭제 요청 (using Domain Store hook)
      await deleteRecordsByPageRange(startPageId, endPageId);
      
      // 모달 닫기
      closeDeleteModal();
      
      // 제품 목록과 데이터베이스 요약 정보를 다시 로드하여 최신 상태 반영
      await loadProducts();
      
      // 데이터가 로드된 후에 전체 제품 데이터 정렬 및 페이지 계산
      // Use current products from the hook instead of store.get()
      
      if (products && products.length > 0) {
        // 내림차순으로 정렬 (pageId * 12 + indexInPage 기준)
        const sortedProducts = [...products].sort((a, b) => {
          const aNo = (a.pageId || 0) * 12 + (a.indexInPage || 0);
          const bNo = (b.pageId || 0) * 12 + (b.indexInPage || 0);
          return bNo - aNo; // 내림차순 정렬
        });
        
        // 총 페이지 수 재계산 (데이터베이스 총 레코드 수 기준)
        const calculatedTotalPages = Math.ceil((dbSummary?.totalProducts || 0) / itemsPerPage);
        setTotalPages(calculatedTotalPages > 0 ? calculatedTotalPages : 1);

        // 삭제 후, 데이터가 있으면 가장 최신 페이지(totalPages)로 이동
        // 데이터가 없으면 1페이지로 설정
        setCurrentPage(calculatedTotalPages > 0 ? calculatedTotalPages : 1); 
        
        // 페이지당 제품 수를 기준으로 총 제품 페이지 수 재계산 (데이터베이스 총 레코드 수 기준)
        const productsPerPage = config?.productsPerPage || 12;
        setTotalProductPages(Math.ceil((dbSummary?.totalProducts || 0) / productsPerPage));
        
        // 최대 pageId 업데이트
        if (sortedProducts.length > 0) {
          const maxId = Math.max(...sortedProducts.map(p => p.pageId || 0));
          console.log(`[UI] 삭제 후 새로운 maxPageId: ${maxId}`);
          setMaxPageId(maxId);
          setDeleteRange({
            startPageId: maxId,
            endPageId: maxId
          });
        } else {
          // 남은 데이터가 없는 경우
          console.log('[UI] 삭제 후 남은 데이터가 없음, maxPageId를 0으로 설정');
          setMaxPageId(0);
          setDeleteRange({
            startPageId: 0,
            endPageId: 0
          });
        }
      } else {
        // 데이터가 없는 경우 초기값으로 설정
        console.log('[UI] 레코드 삭제 후 데이터가 없습니다.');
        setDisplayProducts([]);
        setCurrentPage(1);
        setTotalPages(1);
        setMaxPageId(0);
        setTotalProductPages(0);
        setDeleteRange({
          startPageId: 0,
          endPageId: 0
        });
      }
      
    } catch (error) {
      console.error('[UI] 레코드 삭제 중 오류:', error);
      // 에러가 발생해도 모달은 닫기
      closeDeleteModal();
    }
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
                        <div className="text-sm text-gray-500 dark:text-gray-400">제품 정보가 없습니다. 크롤링을 통해 데이터를 수집해주세요.</div>
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
                            {intToHexDisplay(typeof product.vid === 'number' ? product.vid : parseInt(String(product.vid || '0'), 16))}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 dark:text-gray-200 font-mono">
                            {intToHexDisplay(typeof product.pid === 'number' ? product.pid : parseInt(String(product.pid || '0'), 16))}
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
    </div>
  );
};
