import React, { useState, useEffect, useCallback, SetStateAction } from 'react';
import { observer } from 'mobx-react-lite';
import CrawlingDashboard from '../CrawlingDashboard';
import { ConcurrentTasksVisualizer } from '../../Charts';
import StatusCheckAnimation from '../StatusCheckAnimation';

import { useCrawlingStore } from '../../hooks/useCrawlingStore';
import { useStatusTabViewModel } from '../../providers/ViewModelProvider';

interface StatusTabProps {
  compareExpandedInApp: boolean;
  setCompareExpandedInApp: (expanded: boolean) => void;
  crawlingStatus: string;
  productsLength: number;
}

export const StatusTab: React.FC<StatusTabProps> = observer(({ 
  compareExpandedInApp,
  setCompareExpandedInApp,
  crawlingStatus,
  productsLength: _productsLength
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-700 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* 메인 제어 헤더 */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            크롤링 제어
          </h2>
        </div>
        
        {/* 상태 체크 애니메이션 */}
        <StatusCheckAnimation 
          isChecking={statusTabViewModel.showAnimation} 
          onAnimationComplete={handleAnimationComplete} 
        />
        
        {/* 크롤링 대시보드 - 직접 표시 */}
        <CrawlingDashboard 
          appCompareExpanded={localCompareExpanded}
          setAppCompareExpanded={handleCompareExpandedChange}
        />
        
        {/* 작업 시각화 */}
        <div className="transition-all duration-500 ease-in-out">
          {/* 2단계: 제품 상세정보 수집 시각화 */}
          {progress.currentStage === 2 && (
            <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-700 rounded-lg p-4 space-y-4 border border-blue-200 dark:border-blue-800 shadow-sm">
              <h3 className="text-md font-semibold text-blue-700 dark:text-blue-300 mb-2">
                2단계: 제품 상세정보 수집
              </h3>
              
              {/* 동시 작업 시각화 */}
              <div className="relative">
                <div className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-2">
                  동시 진행 작업
                </div>
                <ConcurrentTasksVisualizer />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
