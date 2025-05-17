import React from 'react';
import { calculateSuccessPages, calculateTotalPages } from '../utils/pageProgressCalculations';
import { debugLog } from '../utils/logger';

/**
 * 페이지 진행 상황 계산을 위한 커스텀 훅
 * 계산 로직을 컴포넌트에서 분리하고 메모이제이션을 통해 성능 최적화
 */
export function usePageProgressCalculation(
  progress: any, 
  tasks: any[], 
  statusSummary: any, 
  config: any, 
  status: any, 
  crawlingStatus: string
) {
  return React.useMemo(() => {
    // 성공한 페이지 수 계산 (status가 'success'인 페이지 수)
    const successTaskPages = tasks.filter(task => task.status === 'success').length;
    
    // 페이지 수 계산 로직 - 항상 최대값을 사용하는 방식으로 개선
    const result = calculateSuccessPages(progress, successTaskPages);
    const displaySuccessPages = result.displaySuccessPages;
    const successSourceUsed = result.successSourceUsed;
    
    // 크롤링 범위 계산 (statusSummary에 있는 경우)
    const crawlingRange = statusSummary?.crawlingRange;
    // 수정: startPage가 더 크므로 계산식 수정 (startPage - endPage + 1)
    const calculatedPageCount = crawlingRange ? (crawlingRange.startPage - crawlingRange.endPage + 1) : 0;
    
    // 디버깅용 로그
    debugLog('Success page count sources:', {
      fromStage1PageStatuses: progress.stage1PageStatuses?.filter((p: any) => p.status === 'success').length || 0,
      fromTasks: successTaskPages,
      fromCurrentPage: progress.currentPage || 0,
      finalValue: displaySuccessPages,
      sourceUsed: successSourceUsed
    });
    
    // 디버깅용 로그
    debugLog('PageProgressDisplay - 계산된 페이지 값:', {
      crawlingRange,
      calculatedPageCount,
      statusTargetPageCount: status.targetPageCount,
      configPageRangeLimit: config.pageRangeLimit
    });
    
    // 표시할 총 페이지 수 계산
    const displayTotalPages = calculateTotalPages(
      progress, 
      statusSummary, 
      crawlingStatus, 
      calculatedPageCount, 
      status, 
      config,
      tasks
    );
    
    return { displaySuccessPages, displayTotalPages };
  }, [progress, tasks, statusSummary, config, status, crawlingStatus]);
}
