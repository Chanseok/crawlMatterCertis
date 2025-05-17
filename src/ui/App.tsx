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
  crawlingProgressStore,
  loadConfig,
  stopCrawling,
  crawlingStatusSummaryStore,
  exportToExcel,
  checkCrawlingStatus,
  startCrawling
} from './stores';

// 새로 분리된 컴포넌트들 import
import { LogPanel } from './components/logs/LogPanel';
import { StatusTab } from './components/tabs/StatusTab';
import { TabsNavigation } from './components/tabs/TabsNavigation'; 
import { AppLayout } from './components/layout/AppLayout';
import { useTabs } from './hooks/useTabs';
import { useCrawlingComplete } from './hooks/useCrawlingComplete';

function App() {
  // nanostores를 통한 상태 관리
  const crawlingStatus = useStore(crawlingStatusStore);
  const products = useStore(productsStore);
  const searchQuery = useStore(searchQueryStore);
  
  // 커스텀 훅을 통한 탭 관리
  const { activeTab, handleTabChange } = useTabs('status');
  
  // 크롤링 완료 관련 데이터 훅
  const { crawlingResults, autoSavedToDb, showCompleteView } = useCrawlingComplete();
  
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
        // 크롤링 시작 전 최신 설정이 적용되도록 보장
        await loadConfig();
        
        // 이미 상태 체크를 한 경우를 판단하기 위해 상태 요약 정보 확인
        const currentSummary = crawlingStatusSummaryStore.get();
        const hasStatusData = currentSummary && 
                             currentSummary.siteTotalPages !== undefined && 
                             currentSummary.siteTotalPages > 0;
        
        // 어느 경우든 크롤링 시작 (내부에서 상태 체크 수행)
        await startCrawling();
      } catch (error) {
        console.error(`크롤링 시작 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }, [crawlingStatus]);

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
    <AppLayout>
      <div className="lg:col-span-1 space-y-6">
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
          />
        )}
        
        {/* 수집된 제품 정보 섹션은 로컬DB 탭으로 이동되었습니다 */}
      </div>
    </AppLayout>
  );
}

export default App;
