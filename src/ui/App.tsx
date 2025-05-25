import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import './App.css';
import { CrawlingSettings } from './components/CrawlingSettings';
import { LocalDBTab } from './components/LocalDBTab';
import { CrawlingCompleteView } from './components/CrawlingCompleteView';
import {
  crawlingStatusStore,
  searchQueryStore,
  searchProducts,
  productsStore,
  loadConfig,
  stopCrawling,
  crawlingStatusSummaryStore,
  exportToExcel,
  checkCrawlingStatus,
  startCrawling,
  addLog
} from './stores';

// 새로 분리된 컴포넌트들 import
import { LogPanel } from './components/logs/LogPanel';
import { StatusTab } from './components/tabs/StatusTab';
import { TabsNavigation } from './components/tabs/TabsNavigation'; 
import { AppLayout } from './components/layout/AppLayout';
import { useTabs } from './hooks/useTabs';
import { useCrawlingComplete } from './hooks/useCrawlingComplete';
import { useApiInitialization } from './hooks/useApiInitialization';
import { AnalysisTab } from './components/tabs/AnalysisTab';
import { ProgressDebugPanel } from './components/debug/ProgressDebugPanel';
import DebugPanel from './components/debug/DebugPanel';

function App() {
  // Development mode detection
  const isDevelopment = import.meta.env.DEV || import.meta.env.NODE_ENV === 'development';
  
  // API 초기화 (앱 시작 시 한 번만 수행)
  useApiInitialization();
  
  // nanostores를 통한 상태 관리
  const crawlingStatus = useStore(crawlingStatusStore);
  const products = useStore(productsStore);
  const searchQuery = useStore(searchQueryStore);
  
  // 커스텀 훅을 통한 탭 관리
  const { activeTab, handleTabChange } = useTabs('status');
  
  // 크롤링 완료 관련 데이터 훅
  const { 
    crawlingResults, 
    autoSavedToDb, 
    showCompleteView, 
    error, 
    isSavingToDb, 
    setLoading,
    resetAllStates
  } = useCrawlingComplete();
  
  // 에러 처리
  useEffect(() => {
    if (error) {
      addLog(`크롤링 결과 처리 오류: ${error}`, 'error');
    }
  }, [error]);
  
  // 크롤링 상태 변경 시 로딩 상태 업데이트
  useEffect(() => {
    // 크롤링 중이거나 waiting, queued 등 진행 중인 상태일 때 로딩 표시
    if (['crawling', 'running', 'waiting', 'queued'].includes(crawlingStatus)) {
      setLoading(true);
    } 
    // ready, error, completed 등 종료된 상태일 때 로딩 중지
    else if (['ready', 'error', 'completed', 'idle', 'stopped'].includes(crawlingStatus)) {
      setLoading(false);
    }
  }, [crawlingStatus, setLoading]);
  
  // DB 저장 상태 모니터링
  useEffect(() => {
    if (isSavingToDb) {
      addLog('크롤링된 제품 정보를 DB에 저장하는 중...', 'info');
    }
  }, [isSavingToDb]);
  
  // 섹션별 확장/축소 상태
  const [statusExpanded, setStatusExpanded] = useState<boolean>(true);
  const [logsExpanded, setLogsExpanded] = useState<boolean>(true);
  
  // 상태 체크 및 비교 섹션 관련 상태
  const [isStatusChecking, setIsStatusChecking] = useState<boolean>(false);
  const [compareExpandedInApp, setCompareExpandedInApp] = useState<boolean>(false);
  
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

  // 크롤링 시작/중지 핸들러
  const handleCrawlToggle = useCallback(async () => {
    if (crawlingStatus === 'running') {
      stopCrawling();
    } else {
      try {
        // 크롤링 시작 전에 이전 크롤링 결과 상태를 리셋
        resetAllStates();
        
        // 크롤링 시작 전 최신 설정이 적용되도록 보장
        await loadConfig();
        
        // 이미 상태 체크를 한 경우를 판단하기 위해 상태 요약 정보 확인
        const currentSummary = crawlingStatusSummaryStore.get();
        const hasStatusData = currentSummary && 
                             currentSummary.siteTotalPages !== undefined && 
                             currentSummary.siteTotalPages > 0;
        
        // 상태 체크가 필요한 경우, 자동으로 상태 체크를 수행
        if (!hasStatusData) {
          addLog('상태 체크 데이터가 없습니다. 크롤링 시작 전 자동으로 상태 체크를 수행합니다...', 'info');
          
          // 상태 체크 UI 효과 - 상태 체크 중임을 표시
          setIsStatusChecking(true);
          
          // 비교 패널을 확장
          setCompareExpandedInApp(true);
          
          try {
            // 상태 체크 실행
            await checkCrawlingStatus();
            
            // 상태 체크 완료 후 약간의 지연으로 UI 업데이트 시간 확보
            await new Promise(resolve => setTimeout(resolve, 1000));
            
          } catch (statusError) {
            addLog(`자동 상태 체크 중 오류가 발생했지만, 크롤링은 계속 진행합니다: ${statusError instanceof Error ? statusError.message : String(statusError)}`, 'warning');
          } finally {
            // 상태 체크 UI 효과 종료
            setIsStatusChecking(false);
          }
        }
        
        // 상태 체크 후 크롤링 시작 (자동 상태 체크 이후이거나 이미 데이터가 있는 경우)
        addLog('크롤링을 시작합니다...', 'info');
        
        // 크롤링 시작 시에는 비교 패널을 축소
        setCompareExpandedInApp(false);
        
        await startCrawling();
      } catch (error) {
        addLog(`크롤링 시작 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
    }
  }, [crawlingStatus, resetAllStates, setIsStatusChecking, setCompareExpandedInApp]);

  // 데이터 내보내기 핸들러
  const handleExport = useCallback(() => {
    exportToExcel();
  }, []);

  // 크롤링 상태 체크 핸들러 
  const handleCheckStatus = useCallback(async () => {
    setCompareExpandedInApp(true);
    setIsStatusChecking(true);
    try {
      await loadConfig(); // Ensure latest config is loaded before checking status
      await checkCrawlingStatus();
    } catch (error) {
      console.error(`상태 체크 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsStatusChecking(false);
    }
  }, []);

  // 섹션 토글 핸들러
  const toggleSection = useCallback((section: 'status' | 'products' | 'logs') => {
    switch (section) {
      case 'status':
        setStatusExpanded(!statusExpanded);
        break;
      case 'logs':
        setLogsExpanded(!logsExpanded);
        break;
    }
  }, [statusExpanded, logsExpanded]);

  // 로그 메시지 렌더링 함수

  return (
    <>
      <AppLayout>
      <div className="lg:col-span-3 space-y-6">
        {/* 컨트롤 패널 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          {/* 탭 네비게이션 */}
          <TabsNavigation 
            activeTab={activeTab} 
            onTabChange={handleTabChange} 
          />
            
          {/* 설정 탭 */}
          {activeTab === 'settings' && (
            <div>
              <CrawlingSettings />
            </div>
          )}
          
          {/* 상태 및 제어 탭 */}
          {activeTab === 'status' && (
            <StatusTab
              statusExpanded={statusExpanded}
              onToggleStatus={() => toggleSection('status')}
              isStatusChecking={isStatusChecking}
              compareExpandedInApp={compareExpandedInApp}
              setCompareExpandedInApp={setCompareExpandedInApp}
              onCheckStatus={handleCheckStatus}
              onCrawlToggle={handleCrawlToggle}
              onExport={handleExport}
              crawlingStatus={crawlingStatus}
              productsLength={products.length}
            />
          )}
            
          {/* 로컬DB 탭 */}
          {activeTab === 'localDB' && (
            <LocalDBTab />
          )}
          
          {/* 분석 탭 */}
          {activeTab === 'analysis' && (
            <AnalysisTab />
          )}
        </div>
        
        {/* 로그 패널 - 모든 탭에 공통으로 표시 */}
        <LogPanel 
          isExpanded={logsExpanded} 
          onToggle={() => toggleSection('logs')} 
        />
      </div>

      {/* 오른쪽 메인 콘텐츠 (데이터 표시) */}
      <div className="lg:col-span-2">
        {/* 크롤링 완료 시 결과 표시 */}
        {activeTab === 'status' && showCompleteView && crawlingStatus === 'completed' && (
          <CrawlingCompleteView 
            products={crawlingResults} 
            autoSavedToDb={autoSavedToDb}
            isSavingToDb={isSavingToDb}
          />
        )}
        
        {/* 수집된 제품 정보 섹션은 로컬DB 탭으로 이동되었습니다 */}
      </div>
      </AppLayout>
      
      {/* 개발 환경에서만 표시되는 디버그 패널 */}
      <ProgressDebugPanel />
      
      {/* 개발 환경에서만 표시되는 종합 디버그 패널 */}
      {isDevelopment && <DebugPanel />}
    </>
  );
}

export default App;
