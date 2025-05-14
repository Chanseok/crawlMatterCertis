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
  
  // 성공한 페이지를 더 정확하게 계산 
  if (progress.currentStage === 1) {
    // progress.stage1PageStatuses가 있으면 성공 상태인 페이지 수를 계산
    if (progress.stage1PageStatuses && Array.isArray(progress.stage1PageStatuses)) {
      const successStatusPages = progress.stage1PageStatuses.filter(p => p.status === 'success').length;
      if (successStatusPages > 0) {
        displaySuccessPages = successStatusPages;
      }
    }
    // 없는 경우 task 또는 currentPage 값 활용
    else if (progress.currentPage !== undefined && progress.currentPage > 0) {
      displaySuccessPages = progress.currentPage;
    }
    // 성공한 태스크가 있으면 그 수를 사용
    else if (tasks && tasks.length > 0 && tasks.filter(task => task.status === 'success').length > 0) {
      displaySuccessPages = tasks.filter(task => task.status === 'success').length;
    }
  }
  
  let displayTotalPages: number | string = '-';
  
  // 크롤링 상태에 따른 표시 설정
  // 1단계 제품 정보 수집 단계에서는 사용자가 설정한 수집 대상 페이지 범위를 우선적으로 표시
  if (
    (crawlingStatus === 'running' && progress.currentStage === 1) || 
    crawlingStatus === 'completed_stage_1'
  ) {
    // 사용자가 설정한 페이지 범위 제한을 우선적으로 사용
    if (config.pageRangeLimit && config.pageRangeLimit > 0) {
      displayTotalPages = config.pageRangeLimit;
    }
    // progress.totalPages 값을 사용 (API에서 보고된 실제 총 페이지 수)
    else if (progress.totalPages && progress.totalPages > 0) {
      displayTotalPages = progress.totalPages;
    }
    // 상태 요약 정보가 있는 경우 (상태 체크 후)
    else if (statusSummary && statusSummary.siteTotalPages > 0) {
      displayTotalPages = statusSummary.siteTotalPages;
    }
    // 마지막 대안으로 기본값 1 사용
    else {
      displayTotalPages = 1;
    }
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
