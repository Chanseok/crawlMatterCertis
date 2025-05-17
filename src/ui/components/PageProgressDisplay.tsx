import React from 'react';
import { useStore } from '@nanostores/react';
import { configStore, concurrentTasksStore, crawlingProgressStore, crawlingStatusStore, crawlingStatusSummaryStore, statusStore } from '../stores';
import { usePageProgressCalculation } from '../hooks/usePageProgressCalculation';
import { useDebugLog } from '../hooks/useDebugLog';

// React.memo를 사용하여 불필요한 리렌더링 방지
export const PageProgressDisplay: React.FC = React.memo(() => {
  const tasks = useStore(concurrentTasksStore);
  const progress = useStore(crawlingProgressStore);
  const crawlingStatus = useStore(crawlingStatusStore);
  const statusSummary = useStore(crawlingStatusSummaryStore);
  const config = useStore(configStore); // pageRangeLimit 접근용
  const status = useStore(statusStore); // targetPageCount 접근용
  
  // 새로운 디버그 훅 사용
  useDebugLog('PageProgressDisplay', { 
    tasksCount: tasks.length,
    successTasks: tasks.filter(task => task.status === 'success').length,
    stage1PageStatusesCount: progress.stage1PageStatuses?.length ?? 0,
    successStage1Pages: progress.stage1PageStatuses?.filter(p => p.status === 'success').length ?? 0,
    currentPage: progress.currentPage,
    targetPageCount: status.targetPageCount
  }, [tasks, progress.stage1PageStatuses, progress.currentPage, status.targetPageCount]);
  
  // 커스텀 훅을 사용하여 계산 로직 분리
  const { displaySuccessPages, displayTotalPages } = usePageProgressCalculation(
    progress, tasks, statusSummary, config, status, crawlingStatus
  );
  
  return (
    <div className="flex justify-between items-center mb-2 px-3 py-1 bg-gray-50 dark:bg-gray-800 rounded">
      <span className="text-sm text-gray-600 dark:text-gray-400">페이지 진행 상황:</span>
      <div className="flex items-center">
        <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
          {displaySuccessPages}
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-500 mx-1">/</span>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {displayTotalPages} 페이지
        </span>
      </div>
    </div>
  );
});

export default PageProgressDisplay;