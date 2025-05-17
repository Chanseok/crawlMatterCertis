import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { crawlingProgressStore } from '../../stores';
import { ExpandableSection } from '../ExpandableSection';
import { CrawlingDashboard } from '../CrawlingDashboard';
import PageProgressDisplay from '../PageProgressDisplay';
import { ConcurrentTasksVisualizer } from '../../Charts';
import StatusCheckAnimation from '../StatusCheckAnimation';
import { SetStateAction } from 'react';

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

export const StatusTab: React.FC<StatusTabProps> = ({ 
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
  const progress = useStore(crawlingProgressStore);
  
  // 애니메이션 상태 관리
  const [showAnimation, setShowAnimation] = useState(false);
  
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
          isAppStatusChecking={isStatusChecking} 
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
      <div className="mt-6 transition-all duration-500 ease-in-out" 
           style={{ 
             opacity: progress.currentStage === 2 ? 0 : 1,
             maxHeight: progress.currentStage === 2 ? '0' : '200px',
             overflow: 'hidden'
           }}>
        <h3 className="text-md font-semibold text-gray-700 dark:text-gray-200 mb-2">제품 목록 페이지 읽기</h3>
        <PageProgressDisplay />
        <ConcurrentTasksVisualizer />
      </div>
    </>
  );
};
