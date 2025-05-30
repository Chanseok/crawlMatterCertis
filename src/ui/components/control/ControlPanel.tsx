import { useStore } from '@nanostores/react';
import { useState } from 'react';
import React from 'react';
import { 
  crawlingStatusStore, 
  crawlingProgressStore,
  crawlingStatusSummaryStore,
  startCrawling, 
  stopCrawling, 
  exportToExcel,
  checkCrawlingStatus,
  addLog,
  loadConfig,
  productsStore
} from '../../stores';
import { ConcurrentTasksVisualizer } from '../../Charts';
import { CrawlingDashboard } from '../CrawlingDashboard';
import PageProgressDisplay from '../PageProgressDisplay';
import { ExpandableSection } from '../ExpandableSection';

type ControlPanelProps = {
  statusExpanded: boolean;
  onToggleStatus: () => void;
};

export const ControlPanel = React.memo(function ControlPanel({ statusExpanded, onToggleStatus }: ControlPanelProps) {
  const [isStatusChecking, setIsStatusChecking] = useState<boolean>(false);
  const [compareExpanded, setCompareExpanded] = useState<boolean>(false);
  const crawlingStatus = useStore(crawlingStatusStore);
  const products = useStore(productsStore);
  const progress = useStore(crawlingProgressStore);

  // 크롤링 시작/중지 핸들러
  const handleCrawlToggle = React.useCallback(async () => {
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
  }, [crawlingStatus]);

  // 데이터 내보내기 핸들러
  const handleExport = React.useCallback(() => {
    exportToExcel();
  }, []);

  // 크롤링 상태 체크 핸들러 
  const handleCheckStatus = React.useCallback(async () => {
    setCompareExpanded(true);
    setIsStatusChecking(true);
    try {
      await loadConfig(); // Ensure latest config is loaded before checking status
      await checkCrawlingStatus();
    } catch (error) {
      addLog(`상태 체크 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsStatusChecking(false);
    }
  }, [setCompareExpanded, setIsStatusChecking]);

  return (
    <>
      <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">크롤링 제어</h2>
      
      {/* 크롤링 대시보드 (접을 수 있는 형태) */}
      <ExpandableSection
        title="수집 상태"
        isExpanded={statusExpanded}
        onToggle={onToggleStatus}
      >
        <CrawlingDashboard 
          isAppStatusChecking={isStatusChecking}
          appCompareExpanded={compareExpanded}
          setAppCompareExpanded={setCompareExpanded}
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
          data-testid="status-check-button"
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
          data-testid="crawl-toggle-button"
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
          data-testid="export-button"
        >
          엑셀 내보내기
        </button>
      </div>

      {/* 컨트롤 패널 아래에 동시 작업 현황 시각화 */}
      <div 
        className="mt-6 transition-all duration-500 ease-in-out" 
        style={{ 
          opacity: progress.currentStage === 2 ? 0 : 1,
          maxHeight: progress.currentStage === 2 ? '0' : '200px',
          overflow: 'hidden'
        }}
        data-testid="task-visualization"
      >
        <h3 className="text-md font-semibold text-gray-700 dark:text-gray-200 mb-2">제품 목록 페이지 읽기</h3>
        
        {/* 성공적으로 완료된 페이지 수 표시 */}
        <PageProgressDisplay />
        
        <ConcurrentTasksVisualizer />
      </div>
    </>
  );
});
