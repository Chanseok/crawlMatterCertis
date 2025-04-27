import { useStore } from '@nanostores/react'
import { useEffect } from 'react'
import './App.css'
import { 
  appModeStore, 
  crawlingStatusStore, 
  crawlingProgressStore, 
  logsStore, 
  productsStore, 
  searchQueryStore, 
  startCrawling, 
  stopCrawling,
  toggleAppMode,
  addLog,
  initializeApiSubscriptions,
  exportToExcel,
  searchProducts
} from './stores'
import { LogEntry } from './types'
import { format } from 'date-fns'

function App() {
  // nanostores를 통한 상태 관리
  const mode = useStore(appModeStore);
  const crawlingStatus = useStore(crawlingStatusStore);
  const progress = useStore(crawlingProgressStore);
  const logs = useStore(logsStore);
  const products = useStore(productsStore);
  const searchQuery = useStore(searchQueryStore);
  
  // API 초기화
  useEffect(() => {
    initializeApiSubscriptions();
    addLog('애플리케이션이 시작되었습니다.', 'info');
  }, []);
  
  // 검색어 변경시 검색 실행
  useEffect(() => {
    const delaySearch = setTimeout(() => {
      searchProducts(searchQuery);
    }, 500);
    
    return () => clearTimeout(delaySearch);
  }, [searchQuery]);
  
  // 크롤링 시작/중지 핸들러
  const handleCrawlToggle = () => {
    if (crawlingStatus === 'running') {
      stopCrawling();
    } else {
      startCrawling();
    }
  };
  
  // 데이터 내보내기 핸들러
  const handleExport = () => {
    exportToExcel();
  };

  // 로그 메시지 렌더링 함수
  const renderLogMessage = (log: LogEntry, index: number) => {
    const colorClass = {
      info: 'text-blue-800 dark:text-blue-400',
      warning: 'text-amber-800 dark:text-amber-400',
      error: 'text-red-800 dark:text-red-400',
      success: 'text-green-800 dark:text-green-400'
    }[log.type];

    return (
      <div key={index} className={`mb-1 ${colorClass}`}>
        [{format(log.timestamp, 'HH:mm:ss')}] {log.message}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* 헤더 영역 */}
      <header className="bg-white dark:bg-gray-800 shadow-md p-4">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Matter 인증 정보 수집기</h1>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <span className="mr-2 text-gray-600 dark:text-gray-300">모드:</span>
              <button 
                onClick={toggleAppMode}
                className={`px-3 py-1 rounded-md text-sm font-medium ${
                  mode === 'development' 
                    ? 'bg-amber-500 text-white' 
                    : 'bg-green-500 text-white'
                }`}
              >
                {mode === 'development' ? '개발 모드' : '실사용 모드'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto py-6 px-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 왼쪽 사이드바 (컨트롤 + 진행 상황) */}
        <div className="lg:col-span-1 space-y-6">
          {/* 컨트롤 패널 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">크롤링 제어</h2>
            
            <button 
              onClick={handleCrawlToggle}
              className={`w-full py-2 px-4 rounded-md text-white font-medium ${
                crawlingStatus === 'running' 
                  ? 'bg-red-500 hover:bg-red-600' 
                  : 'bg-blue-500 hover:bg-blue-600'
              }`}
              disabled={crawlingStatus === 'paused'}
            >
              {crawlingStatus === 'running' ? '크롤링 중지' : '크롤링 시작'}
            </button>
            
            {crawlingStatus === 'running' && (
              <div className="mt-4">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
                  <span>{progress.currentStep}</span>
                  <span>{progress.percentage.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full" 
                    style={{ width: `${progress.percentage}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                  <span>진행: {progress.current}/{progress.total}</span>
                  {progress.remainingTime !== undefined && (
                    <span>예상 남은 시간: {Math.floor(progress.remainingTime / 60)}분 {Math.floor(progress.remainingTime % 60)}초</span>
                  )}
                </div>
              </div>
            )}

            <div className="mt-6">
              <button
                onClick={handleExport}
                className="w-full py-2 px-4 bg-gray-500 hover:bg-gray-600 text-white rounded-md font-medium"
                disabled={crawlingStatus === 'running' || products.length === 0}
              >
                데이터 내보내기 (Excel)
              </button>
            </div>
          </div>
          
          {/* 로그 패널 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">로그</h2>
            <div className="bg-gray-100 dark:bg-gray-700 rounded-md p-4 h-80 overflow-y-auto font-mono text-sm">
              {logs.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400">로그 메시지가 없습니다.</p>
              ) : (
                [...logs].reverse().map((log, index) => renderLogMessage(log, index))
              )}
            </div>
          </div>
        </div>
        
        {/* 오른쪽 메인 콘텐츠 (데이터 표시) */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white">수집된 제품 정보</h2>
              
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="검색..." 
                  value={searchQuery}
                  onChange={(e) => searchQueryStore.set(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <svg 
                  className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
            
            {/* 데이터 테이블 */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">제조사</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">모델</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">기기 유형</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">인증 ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">인증 날짜</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {products.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                        데이터가 없습니다. 크롤링을 시작하여 데이터를 수집해주세요.
                      </td>
                    </tr>
                  ) : (
                    products.map((product) => (
                      <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">{product.manufacturer}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">{product.model}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">{product.deviceType}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">{product.certificationId}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">{product.certificationDate}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            {/* 페이지네이션 (나중에 구현 예정) */}
            <div className="flex justify-between items-center mt-6">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                총 {products.length}개 항목
              </div>
              <div className="flex space-x-2">
                <button className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">이전</button>
                <button className="px-3 py-1 bg-blue-500 text-white rounded">1</button>
                <button className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">다음</button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 푸터 영역 */}
      <footer className="bg-white dark:bg-gray-800 shadow-inner py-4 mt-10">
        <div className="container mx-auto px-4 text-center text-gray-500 dark:text-gray-400 text-sm">
          © {new Date().getFullYear()} Matter 인증 정보 수집기 - 버전 1.0
        </div>
      </footer>
    </div>
  )
}

export default App
