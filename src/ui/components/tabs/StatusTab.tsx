import React, { useState, useEffect, useCallback, SetStateAction, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { ExpandableSection } from '../ExpandableSection';
import CrawlingDashboard from '../CrawlingDashboard';
import PageProgressDisplay from '../PageProgressDisplay';
import { ConcurrentTasksVisualizer } from '../../Charts';
import StatusCheckAnimation from '../StatusCheckAnimation';
import { useCrawlingStore } from '../../hooks/useCrawlingStore';
import { useConfigurationViewModel } from '../../providers/ViewModelProvider';

interface StatusTabProps {
  statusExpanded: boolean;
  onToggleStatus: () => void;
  isStatusChecking: boolean;
  compareExpandedInApp: boolean;
  setCompareExpandedInApp: (expanded: boolean) => void;
  onCheckStatus: () => void;
  onCrawlToggle: () => void;
  onExport: () => void;
  crawlingStatus: string;
  productsLength: number;
}

export const StatusTab: React.FC<StatusTabProps> = observer(({ 
  statusExpanded,
  onToggleStatus,
  isStatusChecking,
  compareExpandedInApp,
  setCompareExpandedInApp,
  onCheckStatus,
  onCrawlToggle,
  onExport,
  crawlingStatus,
  productsLength
}) => {
  const { progress } = useCrawlingStore();
  const configurationViewModel = useConfigurationViewModel();
  
  // Auto status check functionality
  const hasAutoChecked = useRef(false);
  
  // 애니메이션 상태 관리
  const [showAnimation, setShowAnimation] = useState(false);
  
  // Auto status check on first visit when autoStatusCheck is enabled
  useEffect(() => {
    const autoStatusCheck = configurationViewModel.getConfigValue('autoStatusCheck');
    
    if (autoStatusCheck && !hasAutoChecked.current && crawlingStatus !== 'running' && !isStatusChecking && !showAnimation) {
      hasAutoChecked.current = true;
      // Small delay to ensure the tab is fully rendered
      setTimeout(() => {
        setShowAnimation(true);
      }, 500);
    }
  }, [configurationViewModel, crawlingStatus, isStatusChecking, showAnimation]);
  
  // Use useState here to create a proper state setter function that matches the expected type
  const [localCompareExpanded, setLocalCompareExpanded] = useState(compareExpandedInApp);
  
  // Update local state when prop changes
  useEffect(() => {
    setLocalCompareExpanded(compareExpandedInApp);
  }, [compareExpandedInApp]);
  
  // Create a handler function that both updates local state and calls the parent's setter
  const handleCompareExpandedChange = useCallback((value: SetStateAction<boolean>) => {
    setLocalCompareExpanded(value);
    // Convert SetStateAction<boolean> to boolean before passing to the parent setter
    if (typeof value === 'function') {
      setCompareExpandedInApp(value(localCompareExpanded));
    } else {
      setCompareExpandedInApp(value);
    }
  }, [localCompareExpanded, setCompareExpandedInApp]);
  
  // 상태 체크 버튼 핸들러 함수
  const handleStatusCheck = useCallback(() => {
    setShowAnimation(true);
  }, []);

  // 애니메이션 완료 후 실제 상태 체크 함수 호출
  const handleAnimationComplete = useCallback(() => {
    onCheckStatus();
    setTimeout(() => {
      setShowAnimation(false);
    }, 500); // 애니메이션이 완전히 끝난 후 상태 초기화
  }, [onCheckStatus]);
  
  return (
    <>
      <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">크롤링 제어</h2>
      
      {/* 상태 체크 애니메이션 */}
      <StatusCheckAnimation 
        isChecking={showAnimation} 
        onAnimationComplete={handleAnimationComplete} 
      />
      
      {/* 크롤링 대시보드 */}
      <ExpandableSection
        title="수집 상태"
        isExpanded={statusExpanded}
        onToggle={onToggleStatus}
      >
        <CrawlingDashboard 
          appCompareExpanded={localCompareExpanded}
          setAppCompareExpanded={handleCompareExpandedChange}
        />
      </ExpandableSection>
      
      {/* 버튼 그룹 */}
      <div className="flex justify-between mb-4">
        <button
          onClick={handleStatusCheck}
          className="flex-1 py-2 px-2 mr-2 rounded-md text-white font-medium bg-gray-500 hover:bg-gray-600 
          disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-all duration-200
          shadow-md hover:shadow-lg active:translate-y-0.5 active:shadow border border-gray-600
          focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-opacity-50"
          disabled={crawlingStatus === 'running' || isStatusChecking || showAnimation}
        >
          상태 체크
        </button>
        
        <button
          onClick={onCrawlToggle}
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
          onClick={onExport}
          className="flex-1 py-2 px-2 ml-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md font-medium
          disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-all duration-200
          shadow-md hover:shadow-lg active:translate-y-0.5 active:shadow border border-gray-600
          focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-opacity-50"
          disabled={crawlingStatus === 'running' || productsLength === 0}
        >
          엑셀 내보내기
        </button>
      </div>

      {/* 작업 시각화 */}
      <div className="mt-6 transition-all duration-500 ease-in-out">
        {/* 1단계: 제품 목록 페이지 수집 시각화 */}
        {(progress.currentStage === 1 || (progress.currentStage === 0 && crawlingStatus === 'running')) && (
          <div className="space-y-4">
            <h3 className="text-md font-semibold text-gray-700 dark:text-gray-200 mb-2">
              1단계: 제품 목록 페이지 읽기
            </h3>
            <PageProgressDisplay />
            <div className="relative">
              <ConcurrentTasksVisualizer />
            </div>
          </div>
        )}
        
        {/* 2단계: 제품 상세정보 수집 시각화 */}
        {progress.currentStage === 2 && (
          <div className="space-y-4">
            <h3 className="text-md font-semibold text-gray-700 dark:text-gray-200 mb-2">
              2단계: 제품 상세정보 수집
            </h3>
            
            {/* 2단계 진행률 표시 */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  상세정보 수집 진행률
                </span>
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                  {progress.processedItems || 0} / {progress.totalItems || 0} 
                  ({Math.round(progress.percentage || 0)}%)
                </span>
              </div>
              
              {/* 진행률 바 */}
              <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2.5">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(progress.percentage || 0, 100)}%` }}
                ></div>
              </div>
              
              {/* 수집 상태 정보 */}
              <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                <div className="text-center">
                  <div className="font-semibold text-green-600 dark:text-green-400">
                    {progress.newItems || 0}
                  </div>
                  <div className="text-gray-500 dark:text-gray-400">신규</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-blue-600 dark:text-blue-400">
                    {progress.updatedItems || 0}
                  </div>
                  <div className="text-gray-500 dark:text-gray-400">업데이트</div>
                </div>
              </div>
              
              {/* 현재 진행 메시지 */}
              {progress.message && (
                <div className="mt-3 text-xs text-gray-600 dark:text-gray-400 text-center">
                  {progress.message}
                </div>
              )}
            </div>
            
            {/* 동시 작업 시각화 - 2단계에서도 표시 */}
            <div className="relative">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                동시 진행 작업
              </div>
              <ConcurrentTasksVisualizer />
            </div>
          </div>
        )}
        
        {/* 크롤링이 시작되지 않았거나 완료된 경우 */}
        {(crawlingStatus === 'idle' || crawlingStatus === 'completed') && progress.currentStage !== 1 && progress.currentStage !== 2 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <div className="text-lg mb-2">🚀</div>
            <div className="text-sm">크롤링을 시작하면 진행 상황이 여기에 표시됩니다</div>
          </div>
        )}
      </div>
    </>
  );
});
