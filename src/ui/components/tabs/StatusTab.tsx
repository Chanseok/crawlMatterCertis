import React, { useState, useEffect, useCallback, SetStateAction } from 'react';
import { observer } from 'mobx-react-lite';
import { ExpandableSection } from '../ExpandableSection';
import CrawlingDashboard from '../CrawlingDashboard';
import { ConcurrentTasksVisualizer } from '../../Charts';
import StatusCheckAnimation from '../StatusCheckAnimation';
import { CompactStatusDisplay } from '../CompactStatusDisplay';

import { useCrawlingStore } from '../../hooks/useCrawlingStore';
import { useStatusTabViewModel } from '../../providers/ViewModelProvider';

interface StatusTabProps {
  statusExpanded: boolean;
  onToggleStatus: () => void;
  compareExpandedInApp: boolean;
  setCompareExpandedInApp: (expanded: boolean) => void;
  crawlingStatus: string;
  productsLength: number;
}

export const StatusTab: React.FC<StatusTabProps> = observer(({ 
  statusExpanded,
  onToggleStatus,
  compareExpandedInApp,
  setCompareExpandedInApp,
  crawlingStatus,
  productsLength
}) => {
  const { progress } = useCrawlingStore();
  const statusTabViewModel = useStatusTabViewModel();
  
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

  // Update ViewModel state when store changes
  useEffect(() => {
    statusTabViewModel.updateCrawlingState(
      crawlingStatus === 'running',
      progress.totalItems || 0
    );
  }, [crawlingStatus, progress.totalItems, statusTabViewModel]);

  // Auto status check on first visit
  useEffect(() => {
    if (!statusTabViewModel.hasAutoChecked) {
      statusTabViewModel.performAutoStatusCheck();
    }
  }, [statusTabViewModel]);

  // 애니메이션 완료 후 실제 상태 체크 함수 호출
  const handleAnimationComplete = useCallback(() => {
    statusTabViewModel.onAnimationComplete();
  }, [statusTabViewModel]);
  
  return (
    <>
      <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">크롤링 제어</h2>
      
      {/* 상태 체크 애니메이션 */}
      <StatusCheckAnimation 
        isChecking={statusTabViewModel.showAnimation} 
        onAnimationComplete={handleAnimationComplete} 
      />
      
      {/* 압축된 상태 표시 */}
      <div className="mb-4">
        <CompactStatusDisplay
          crawlingStatus={crawlingStatus}
          currentStage={progress.currentStage || 0}
          currentPage={progress.currentPage || 0}
          totalPages={progress.totalPages || 0}
          processedItems={progress.processedItems || 0}
          totalItems={progress.totalItems || productsLength}
          percentage={progress.percentage || 0}
          elapsedTime={progress.elapsedTime || 0}
          message={progress.message}
        />
      </div>
      
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


      
      {/* 통합된 제어 버튼 - 중복 제거 */}
      {/* Removed redundant bottom control buttons for clarity */}
      
      {/* 작업 시각화 */}
      <div className="mt-6 transition-all duration-500 ease-in-out">
        {/* 2단계: 제품 상세정보 수집 시각화 */}
        {progress.currentStage === 2 && (
          <div className="space-y-4">
            <h3 className="text-md font-semibold text-gray-700 dark:text-gray-200 mb-2">
              2단계: 제품 상세정보 수집
            </h3>
            
            {/* 동시 작업 시각화 - 2단계에서도 표시 */}
            <div className="relative">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                동시 진행 작업
              </div>
              <ConcurrentTasksVisualizer />
            </div>
          </div>
        )}

      </div>
    </>
  );
});
