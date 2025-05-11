import React from 'react';
import { useStore } from '@nanostores/react';
import { concurrentTasksStore, crawlingProgressStore, crawlingStatusStore, crawlingStatusSummaryStore } from '../stores';

export const PageProgressDisplay: React.FC = () => {
  const tasks = useStore(concurrentTasksStore);
  const progress = useStore(crawlingProgressStore);
  const crawlingStatus = useStore(crawlingStatusStore);
  const statusSummary = useStore(crawlingStatusSummaryStore);
  
  // 성공한 페이지 수 계산 (status가 'success'인 페이지 수)
  const successPages = tasks.filter(task => task.status === 'success').length;
  
  // 페이지 수 계산 로직
  let displaySuccessPages = successPages;
  let displayTotalPages: number | string = '-';
  
  // 크롤링 상태에 따른 표시 설정
  if (crawlingStatus === 'running' || crawlingStatus === 'completed' || crawlingStatus === 'completed_stage_1') {
    // 상태 요약 정보가 있는 경우 (상태 체크 후)
    if (statusSummary && statusSummary.siteTotalPages > 0) {
      // 진행 상황의 총 페이지 수
      displayTotalPages = statusSummary.siteTotalPages;
    } 
    // 진행 정보에 totalPages가 있는 경우
    else if (progress.totalPages && progress.totalPages > 0) {
      displayTotalPages = progress.totalPages;
    }
    // tasks 배열에 크롤링할 페이지가 있는 경우
    else if (tasks.length > 0) {
      displayTotalPages = tasks.length;
    }
  }
  
  return (
    <div className="flex justify-between items-center mb-2">
      <span className="text-sm text-gray-600 dark:text-gray-400">페이지 진행 상황:</span>
      <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
        {displaySuccessPages} / {displayTotalPages} 페이지
      </span>
    </div>
  );
};

export default PageProgressDisplay;
