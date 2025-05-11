import React from 'react';
import { useStore } from '@nanostores/react';
import { configStore, concurrentTasksStore, crawlingProgressStore, crawlingStatusStore, crawlingStatusSummaryStore } from '../stores';

export const PageProgressDisplay: React.FC = () => {
  const tasks = useStore(concurrentTasksStore);
  const progress = useStore(crawlingProgressStore);
  const crawlingStatus = useStore(crawlingStatusStore);
  const statusSummary = useStore(crawlingStatusSummaryStore);
  const config = useStore(configStore); // Added to access pageRangeLimit
  
  // 성공한 페이지 수 계산 (status가 'success'인 페이지 수)
  const successPages = tasks.filter(task => task.status === 'success').length;
  
  // 페이지 수 계산 로직
  let displaySuccessPages = successPages;
  let displayTotalPages: number | string = '-';
  
  // 크롤링 상태에 따른 표시 설정
  // 1단계 제품 정보 수집 단계 (진행 중 또는 완료 직후)에서는 설정된 수집 대상 페이지 수를 표시합니다.
  // (가정: progress.currentStage가 현재 진행 중인 단계를 나타내며, 1단계는 값이 1이라고 가정합니다.)
  if (
    (crawlingStatus === 'running' && progress.currentStage === 1) || 
    crawlingStatus === 'completed_stage_1'
  ) {
    displayTotalPages = config.pageRangeLimit;
  } 
  // 기타 크롤링 상태 (예: 2단계 진행 중, 전체 완료 등)에서는 기존 로직을 따릅니다.
  else if (crawlingStatus === 'running' || crawlingStatus === 'completed') {
    // 상태 요약 정보가 있는 경우 (상태 체크 후)
    if (statusSummary && statusSummary.siteTotalPages > 0) {
      // 진행 상황의 총 페이지 수
      displayTotalPages = statusSummary.siteTotalPages;
    } 
    // 진행 정보에 totalPages가 있는 경우
    else if (progress.totalPages && progress.totalPages > 0) {
      displayTotalPages = progress.totalPages;
    }
    // tasks 배열에 크롤링할 페이지가 있는 경우 (기존 fallback)
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
