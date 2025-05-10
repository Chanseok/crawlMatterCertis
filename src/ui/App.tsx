import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import './App.css';
import { ConcurrentTasksVisualizer } from './Charts';
import { CrawlingSettings } from './components/CrawlingSettings';
import { CrawlingDashboard } from './components/CrawlingDashboard';
import { LocalDBTab } from './components/LocalDBTab';
import { CrawlingCompleteView } from './components/CrawlingCompleteView';
import StatusCheckLoadingAnimation from './components/StatusCheckLoadingAnimation';
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
  lastCrawlingStatusSummaryStore,
  CrawlingStatusSummary,
  crawlingProgressStore,
  loadConfig
} from './stores';
import { LogEntry } from './types';
import { format } from 'date-fns';
import { getPlatformApi } from './platform/api';

// ExpandableSection 컴포넌트 - Hook 규칙을 준수하도록 별도 컴포넌트로 추출
const ExpandableSection = ({
  title,
  isExpanded,
  onToggle,
  children,
  additionalClasses = '',
  isLoading,
  loadingContent
}: {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  additionalClasses?: string;
  isLoading?: boolean;
  loadingContent?: React.ReactNode;
}) => {
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div className={`mb-4 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden ${additionalClasses}`}>
      {/* 헤더 (클릭 시 접기/펼치기) */}
      <div
        className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-750 cursor-pointer"
        onClick={onToggle}
      >
        <h3 className="font-medium text-gray-700 dark:text-gray-300">{title}</h3>
        <svg
          className={`w-5 h-5 text-gray-500 transition-transform duration-300 ${isExpanded ? 'transform rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* 내용 (접기/펼치기) */}
      <div
        ref={contentRef}
        className="transition-all duration-300 ease-in-out overflow-hidden"
        style={{
          maxHeight: isExpanded ? '5000px' : '0',
          opacity: isExpanded ? 1 : 0,
          visibility: isExpanded ? 'visible' : 'hidden',
          display: 'block',
          transition: isExpanded
            ? 'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out, transform 0.3s ease-in-out'
            : 'max-height 0.3s ease-in-out, opacity 0.2s ease-in-out, transform 0.3s ease-in-out, visibility 0s linear 0.3s',
          transform: isExpanded ? 'translateY(0)' : 'translateY(-10px)',
        }}
      >
        <div className="p-4">
          {isLoading && loadingContent ? loadingContent : children}
        </div>
      </div>
    </div>
  );
};

function App() {
  // nanostores를 통한 상태 관리
  const mode = useStore(appModeStore);
  const crawlingStatus = useStore(crawlingStatusStore);
  const logs = useStore(logsStore);
  const products = useStore(productsStore);
  const searchQuery = useStore(searchQueryStore);
  const statusSummary = useStore(crawlingStatusSummaryStore);
  const lastStatusSummary = useStore(lastCrawlingStatusSummaryStore);
  const progress = useStore(crawlingProgressStore);
  
  // 설정 및 탭 관련 상태
  const [activeTab, setActiveTab] = useState<'settings' | 'status' | 'localDB'>('status');
  
  // 섹션별 확장/축소 상태
  const [statusExpanded, setStatusExpanded] = useState<boolean>(true);
  const [compareExpanded, setCompareExpanded] = useState<boolean>(false);
  const [productsExpanded, setProductsExpanded] = useState<boolean>(true);
  const [logsExpanded, setLogsExpanded] = useState<boolean>(true);
  
  // 크롤링 결과 관련 상태 추가
  const [crawlingResults, setCrawlingResults] = useState<any[]>([]);
  const [autoSavedToDb, setAutoSavedToDb] = useState<boolean | undefined>(undefined);
  const [showCompleteView, setShowCompleteView] = useState<boolean>(false);
  const [isStatusChecking, setIsStatusChecking] = useState<boolean>(false);
  
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
      // 크롤링 시작 시 자동 축소
      setTimeout(() => {
        setCompareExpanded(false);
      }, 500); // 애니메이션 효과를 위해 약간의 지연 적용
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
  const handleCrawlToggle = () => {
    if (crawlingStatus === 'running') {
      stopCrawling();
    } else {
      startCrawling();
      // 크롤링 시작 시 애니메이션과 함께 비교 섹션 축소
      setTimeout(() => {
        setCompareExpanded(false);
      }, 300);
    }
  };

  // 데이터 내보내기 핸들러
  const handleExport = () => {
    exportToExcel();
  };

  // 크롤링 상태 체크 핸들러 
  const handleCheckStatus = async () => {
    // Expand immediately if it's not already expanded
    if (!compareExpanded) {
      setCompareExpanded(true);
    }
    setIsStatusChecking(true); // Indicate that status checking has started

    try {
      await loadConfig(); // Ensure latest config is loaded before checking status
      await checkCrawlingStatus();
    } catch (error) {
      addLog(`상태 체크 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsStatusChecking(false); // Indicate that status checking has finished
    }
  };

  // 섹션 토글 핸들러
  const toggleSection = (section: 'status' | 'compare' | 'products' | 'logs') => {
    switch (section) {
      case 'status':
        setStatusExpanded(!statusExpanded);
        break;
      case 'compare':
        setCompareExpanded(!compareExpanded);
        break;
      case 'products':
        setProductsExpanded(!productsExpanded);
        break;
      case 'logs':
        setLogsExpanded(!logsExpanded);
        break;
    }
  };

  // 변경된 상태 값 감지
  const isValueChanged = (key: keyof CrawlingStatusSummary): boolean => {
    if (!statusSummary || !lastStatusSummary) return false;
    
    if (key === 'dbLastUpdated') {
      const current = statusSummary.dbLastUpdated ? new Date(statusSummary.dbLastUpdated).getTime() : null;
      const last = lastStatusSummary.dbLastUpdated ? new Date(lastStatusSummary.dbLastUpdated).getTime() : null;
      return current !== last;
    }
    
    return JSON.stringify(statusSummary[key]) !== JSON.stringify(lastStatusSummary[key]);
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
                  <CrawlingDashboard />
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
                  <ConcurrentTasksVisualizer />
                </div>

                {/* 사이트 로컬 비교 섹션 - 항상 표시되도록 수정 */}
                <ExpandableSection
                  title="사이트 로컬 비교"
                  isExpanded={compareExpanded}
                  onToggle={() => toggleSection('compare')}
                  additionalClasses="site-local-compare-section"
                  isLoading={isStatusChecking}
                  loadingContent={<StatusCheckLoadingAnimation />}
                >
                  {/* 이 부분은 isStatusChecking이 false일 때만 렌더링됩니다. */}
                  {Object.keys(statusSummary || {}).length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-20">
                      <p className="text-center text-gray-600 dark:text-gray-400">
                        사이트와 로컬 DB 정보를 비교하려면<br/>"상태 체크" 버튼을 클릭하세요.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-400">마지막 DB 업데이트:</span>
                        <span className={`font-medium ${isValueChanged('dbLastUpdated') ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-800 dark:text-gray-200'}`}>
                          {statusSummary.dbLastUpdated
                            ? format(new Date(statusSummary.dbLastUpdated), 'yyyy-MM-dd HH:mm')
                            : '없음'}
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-400">DB 제품 수:</span>
                        <span className={`font-medium ${isValueChanged('dbProductCount') ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-800 dark:text-gray-200'}`}>
                          {statusSummary.dbProductCount.toLocaleString()}개
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-400">사이트 페이지 수:</span>
                        <span className={`font-medium ${isValueChanged('siteTotalPages') ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-800 dark:text-gray-200'}`}>
                          {statusSummary.siteTotalPages.toLocaleString()}페이지
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-400">사이트 제품 수:</span>
                        <span className={`font-medium ${isValueChanged('siteProductCount') ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-800 dark:text-gray-200'}`}>
                          {statusSummary.siteProductCount.toLocaleString()}개
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-400">차이:</span>
                        <span className={`font-medium ${isValueChanged('diff') ? 'text-yellow-600 dark:text-yellow-400' : statusSummary.diff > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                          {statusSummary.diff > 0 ? '+' : ''}{statusSummary.diff.toLocaleString()}개
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-400">크롤링 필요:</span>
                        <span className={`font-medium ${isValueChanged('needCrawling') ? 'text-yellow-600 dark:text-yellow-400' : statusSummary.needCrawling ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                          {statusSummary.needCrawling ? '예' : '아니오'}
                        </span>
                      </div>

                      {statusSummary.crawlingRange && (
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600 dark:text-gray-400">크롤링 범위:</span>
                          <span className={`font-medium ${isValueChanged('crawlingRange') ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-800 dark:text-gray-200'}`}>
                            {statusSummary.crawlingRange.startPage} ~ {statusSummary.crawlingRange.endPage} 페이지
                          </span>
                        </div>
                      )}

                      {/* 그래프로 표현 */}
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <div className="mb-2 flex justify-between text-xs">
                          <span className="text-gray-500 dark:text-gray-400">DB</span>
                          <span className="text-gray-500 dark:text-gray-400">사이트</span>
                        </div>
                        <div className="relative h-6 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="absolute top-0 left-0 h-full bg-blue-500"
                            style={{ width: `${Math.min(100, (statusSummary.dbProductCount / Math.max(statusSummary.siteProductCount, 1)) * 100)}%` }}
                          ></div>
                          {statusSummary.diff > 0 && (
                            <div
                              className="absolute top-0 right-0 h-full bg-red-400 opacity-70"
                              style={{ width: `${Math.min(100, (statusSummary.diff / Math.max(statusSummary.siteProductCount, 1)) * 100)}%` }}
                            ></div>
                          )}
                        </div>
                        <div className="flex justify-between mt-1 text-xs">
                          <span className="text-gray-500 dark:text-gray-400">{statusSummary.dbProductCount.toLocaleString()}</span>
                          <span className="text-gray-500 dark:text-gray-400">{statusSummary.siteProductCount.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </ExpandableSection>
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
          
          {activeTab !== 'localDB' && (
            <ExpandableSection
              title="수집된 제품 정보"
              isExpanded={productsExpanded}
              onToggle={() => toggleSection('products')}
            >
              <div className="flex justify-between items-center mb-6">
                <div className="relative w-full max-w-md">
                  <input
                    type="text"
                    placeholder="검색..."
                    value={searchQuery}
                    onChange={(e) => searchQueryStore.set(e.target.value)}
                    className="pl-10 pr-4 py-2 w-full border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        <tr key={product.url} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">{product.manufacturer}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">{product.model}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">{product.deviceType}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">{product.certificationId}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                            {product.certificationDate instanceof Date
                              ? format(product.certificationDate, 'yyyy-MM-dd') : product.certificationDate}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* 페이지네이션 (나중에 구현 예정) */}
              <div className="flex justify-between items-center mt-6">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  총 {products.length.toLocaleString()}개 항목
                </div>
                <div className="flex space-x-2">
                  <button className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">이전</button>
                  <button className="px-3 py-1 bg-blue-500 text-white rounded">1</button>
                  <button className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">다음</button>
                </div>
              </div>
            </ExpandableSection>
          )}
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
