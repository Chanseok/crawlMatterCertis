import { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import './App.css';
import { ConcurrentTasksVisualizer } from './Charts';
import { CrawlingSettings } from './components/CrawlingSettings';
import { CrawlingDashboard } from './components/CrawlingDashboard';
import { LocalDBTab } from './components/LocalDBTab';
import { CrawlingCompleteView } from './components/CrawlingCompleteView';
import PageProgressDisplay from './components/PageProgressDisplay';
import { ExpandableSection } from './components/ExpandableSection';
import {
  appModeStore,
  crawlingStatusStore,
  logsStore,
  productsStore,
  searchQueryStore,
  startCrawling,
  stopCrawling,
  toggleAppMode,
  addLog,
  initializeApiSubscriptions,
  exportToExcel,
  searchProducts,
  checkCrawlingStatus,
  crawlingStatusSummaryStore,
  crawlingProgressStore,
  loadConfig
} from './stores';
import { LogEntry } from './types';
import { format } from 'date-fns';
import { getPlatformApi } from './platform/api';

function App() {
  // nanostores를 통한 상태 관리
  const mode = useStore(appModeStore);
  const crawlingStatus = useStore(crawlingStatusStore);
  const logs = useStore(logsStore);
  const products = useStore(productsStore);
  const searchQuery = useStore(searchQueryStore);
  const progress = useStore(crawlingProgressStore);
  
  // 설정 및 탭 관련 상태
  const [activeTab, setActiveTab] = useState<'settings' | 'status' | 'localDB'>('status');
  
  // 섹션별 확장/축소 상태
  const [statusExpanded, setStatusExpanded] = useState<boolean>(true);
  const [productsExpanded, setProductsExpanded] = useState<boolean>(true);
  const [logsExpanded, setLogsExpanded] = useState<boolean>(true);
  
  // 크롤링 결과 관련 상태 추가
  const [crawlingResults, setCrawlingResults] = useState<any[]>([]);
  const [autoSavedToDb, setAutoSavedToDb] = useState<boolean | undefined>(undefined);
  const [showCompleteView, setShowCompleteView] = useState<boolean>(false);

  // 상태 체크 및 비교 섹션 관련 상태
  const [isStatusChecking, setIsStatusChecking] = useState<boolean>(false);
  const [compareExpandedInApp, setCompareExpandedInApp] = useState<boolean>(false);
  
  // API 초기화
  useEffect(() => {
    initializeApiSubscriptions();
    addLog('애플리케이션이 시작되었습니다.', 'info');
    
    // 크롤링 완료 이벤트 구독
    const api = getPlatformApi();
    const unsubscribe = api.subscribeToEvent('crawlingComplete', (data: any) => {
      if (
        data.success &&
        Array.isArray(data.products) &&
        data.products.length > 0
      ) {
        // 크롤링 결과 저장
        setCrawlingResults(data.products);
        // 자동 DB 저장 여부 설정
        setAutoSavedToDb(data.autoSavedToDb);
        // 완료 뷰 표시 활성화
        setShowCompleteView(true);
      }
    });
    
    // 자동 DB 저장 결과 이벤트 구독
    const unsubscribeDbSave = api.subscribeToEvent('dbSaveComplete', (data) => {
      if (data.success) {
        setAutoSavedToDb(true);
      }
    });
    
    // 자동 DB 저장 스킵 이벤트 구독
    const unsubscribeDbSkip = api.subscribeToEvent('dbSaveSkipped', (_data) => {
      setAutoSavedToDb(false);
    });
    
    return () => {
      unsubscribe();
      unsubscribeDbSave();
      unsubscribeDbSkip();
    };
  }, []);

  // 검색어 변경시 검색 실행
  useEffect(() => {
    const delaySearch = setTimeout(() => {
      searchProducts(searchQuery);
    }, 500);

    return () => clearTimeout(delaySearch);
  }, [searchQuery]);
  
  // 상태 체크 및 크롤링 시작 시 섹션 확장/축소 효과
  useEffect(() => {
    if (crawlingStatus === 'running') {
      setCompareExpandedInApp(false);
    }
  }, [crawlingStatus]);

  // 탭 변경 시 필요한 데이터 로드
  const handleTabChange = (tab: 'settings' | 'status' | 'localDB') => {
    // 이전 탭이 설정 탭이었고, 새 탭이 상태 & 제어 탭인 경우
    if (activeTab === 'settings' && tab === 'status') {
      // 설정 정보 리로드 (최신 설정을 확실히 반영)
      loadConfig().then(() => {
        addLog('탭 전환: 최신 설정 정보를 로드했습니다.', 'info');
      });
    }
    setActiveTab(tab);
  };

  // 크롤링 시작/중지 핸들러
  const handleCrawlToggle = async () => {
    if (crawlingStatus === 'running') {
      stopCrawling();
    } else {
      try {
        // 크롤링 시작 전 최신 설정이 적용되도록 보장
        await loadConfig();
        
        // 이미 상태 체크를 한 경우를 판단하기 위해 상태 요약 정보 확인
        const currentSummary = crawlingStatusSummaryStore.get();
        const hasStatusData = currentSummary && 
                             currentSummary.siteTotalPages !== undefined && 
                             currentSummary.siteTotalPages > 0;
        
        // 상태 체크를 하지 않았다면 자동으로 수행
        if (!hasStatusData) {
          addLog('크롤링을 시작하기 전에 상태 확인을 자동으로 수행합니다...', 'info');
        }
        
        // 어느 경우든 크롤링 시작 (내부에서 상태 체크 수행)
        await startCrawling();
      } catch (error) {
        addLog(`크롤링 시작 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
    }
  };

  // 데이터 내보내기 핸들러
  const handleExport = () => {
    exportToExcel();
  };

  // 크롤링 상태 체크 핸들러 
  const handleCheckStatus = async () => {
    setCompareExpandedInApp(true);
    setIsStatusChecking(true);
    try {
      await loadConfig(); // Ensure latest config is loaded before checking status
      await checkCrawlingStatus();
    } catch (error) {
      addLog(`상태 체크 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsStatusChecking(false);
    }
  };

  // 섹션 토글 핸들러
  const toggleSection = (section: 'status' | 'products' | 'logs') => {
    switch (section) {
      case 'status':
        setStatusExpanded(!statusExpanded);
        break;
      case 'products':
        setProductsExpanded(!productsExpanded);
        break;
      case 'logs':
        setLogsExpanded(!logsExpanded);
        break;
    }
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
      <div key={index} className={`mb-1 text-left ${colorClass}`}>
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
                className={`px-3 py-1 rounded-md text-sm font-medium ${mode === 'development'
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
            {/* 탭 네비게이션 */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
              <button
                className={`px-4 py-2 text-sm font-medium ${
                  activeTab === 'settings'
                    ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
                onClick={() => handleTabChange('settings')}
              >
                설정
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium ${
                  activeTab === 'status'
                    ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
                onClick={() => handleTabChange('status')}
              >
                상태 & 제어
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium ${
                  activeTab === 'localDB'
                    ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
                onClick={() => handleTabChange('localDB')}
              >
                로컬DB
              </button>
            </div>
            
            {/* 설정 탭 */}
            {activeTab === 'settings' && (
              <div>
                <CrawlingSettings />
              </div>
            )}
            
            {/* 상태 및 제어 탭 */}
            {activeTab === 'status' && (
              <>
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">크롤링 제어</h2>
                
                {/* 크롤링 대시보드 (접을 수 있는 형태) */}
                <ExpandableSection
                  title="수집 상태"
                  isExpanded={statusExpanded}
                  onToggle={() => toggleSection('status')}
                >
                  <CrawlingDashboard 
                    isAppStatusChecking={isStatusChecking} 
                    appCompareExpanded={compareExpandedInApp}
                    setAppCompareExpanded={setCompareExpandedInApp}
                  />
                </ExpandableSection>
                
                {/* 버튼 그룹을 한 줄로 배치 */}
                <div className="flex justify-between mb-4">
                  <button
                    onClick={handleCheckStatus}
                    className="flex-1 py-2 px-2 mr-2 rounded-md text-white font-medium bg-gray-500 hover:bg-gray-600 
                    disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-all duration-200
                    shadow-md hover:shadow-lg active:translate-y-0.5 active:shadow border border-gray-600
                    focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-opacity-50"
                    disabled={crawlingStatus === 'running'}
                  >
                    상태 체크
                  </button>
                  
                  <button
                    onClick={handleCrawlToggle}
                    className={`flex-1 py-2 px-2 mx-2 rounded-md text-white font-medium transition-all duration-200
                    shadow-md hover:shadow-lg active:translate-y-0.5 active:shadow focus:outline-none
                    focus:ring-2 focus:ring-opacity-50 ${
                      crawlingStatus === 'running'
                        ? 'bg-red-500 hover:bg-red-600 border border-red-600 focus:ring-red-400'
                        : 'bg-blue-500 hover:bg-blue-600 border border-blue-600 focus:ring-blue-400'
                    }`}
                    disabled={crawlingStatus === 'paused'}
                  >
                    {crawlingStatus === 'running' ? '크롤링 중지' : '크롤링 시작'}
                  </button>
                  
                  <button
                    onClick={handleExport}
                    className="flex-1 py-2 px-2 ml-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md font-medium
                    disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-all duration-200
                    shadow-md hover:shadow-lg active:translate-y-0.5 active:shadow border border-gray-600
                    focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-opacity-50"
                    disabled={crawlingStatus === 'running' || products.length === 0}
                  >
                    엑셀 내보내기
                  </button>
                </div>
    
                {/* 컨트롤 패널 아래에 동시 작업 현황 시각화 */}
                <div className="mt-6 transition-all duration-500 ease-in-out" 
                     style={{ 
                       opacity: progress.currentStage === 2 ? 0 : 1,
                       maxHeight: progress.currentStage === 2 ? '0' : '200px',
                       overflow: 'hidden'
                     }}>
                  <h3 className="text-md font-semibold text-gray-700 dark:text-gray-200 mb-2">제품 목록 페이지 읽기</h3>
                  
                  {/* 성공적으로 완료된 페이지 수 표시 */}
                  <PageProgressDisplay />
                  
                  <ConcurrentTasksVisualizer />
                </div>
              </>
            )}
            
            {/* 로컬DB 탭 */}
            {activeTab === 'localDB' && (
              <LocalDBTab />
            )}
          </div>
          
          {/* 로그 패널 - 모든 탭에 공통으로 표시 */}
          <ExpandableSection
            title="로그"
            isExpanded={logsExpanded}
            onToggle={() => toggleSection('logs')}
            additionalClasses="mt-6"
          >
            <div className="bg-gray-100 dark:bg-gray-700 rounded-md p-4 h-80 overflow-y-auto font-mono text-sm">
              {logs.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-left">로그 메시지가 없습니다.</p>
              ) : (
                [...logs].reverse().map((log, index) => renderLogMessage(log, index))
              )}
            </div>
          </ExpandableSection>
        </div>

        {/* 오른쪽 메인 콘텐츠 (데이터 표시) */}
        <div className="lg:col-span-2">
          {/* 크롤링 완료 시 결과 표시 */}
          {activeTab === 'status' && showCompleteView && crawlingStatus === 'completed' && (
            <CrawlingCompleteView 
              products={crawlingResults} 
              autoSavedToDb={autoSavedToDb}
            />
          )}
          
          {/* 수집된 제품 정보 섹션은 로컬DB 탭으로 이동되었습니다 */}
        </div>
      </main>

      {/* 푸터 영역 */}
      <footer className="bg-white dark:bg-gray-800 shadow-inner py-4 mt-10">
        <div className="container mx-auto px-4 text-center text-gray-500 dark:text-gray-400 text-sm">
          © {new Date().getFullYear()} Matter 인증 정보 수집기 - 버전 1.0
        </div>
      </footer>
    </div>
  );
}

export default App;
