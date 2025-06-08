/**
 * 페이지 진행 상황 계산을 위한 유틸리티 함수
 */

// ProgressUtils import available for future consolidation opportunities

/**
 * 성공한 페이지 수를 계산
 * 여러 소스 중 가장 높은 값을 사용
 */
export function calculateSuccessPages(progress: any, successTaskPages: number) {
  let displaySuccessPages = 0;
  let successSourceUsed = '';
  
  // 1. stage1PageStatuses에서 성공 상태인 페이지 수 확인 (가장 신뢰할 수 있는 소스)
  if (progress.stage1PageStatuses && Array.isArray(progress.stage1PageStatuses) && 
      progress.stage1PageStatuses.length > 0) {
    const successStatusPages = progress.stage1PageStatuses.filter((p: any) => p.status === 'success').length;
    if (successStatusPages > displaySuccessPages) {
      displaySuccessPages = successStatusPages;
      successSourceUsed = 'stage1PageStatuses';
    }
  }
  
  // 2. 성공한 태스크 수 확인 (실시간 업데이트에 가장 민감한 소스)
  if (successTaskPages > displaySuccessPages) {
    displaySuccessPages = successTaskPages;
    successSourceUsed = 'tasks';
  }
  
  // 3. currentPage 값 확인 (이전 버전과의 호환성)
  if (progress.currentPage !== undefined && progress.currentPage > 0 && progress.currentPage > displaySuccessPages) {
    displaySuccessPages = progress.currentPage;
    successSourceUsed = 'currentPage';
  }
  
  return { displaySuccessPages, successSourceUsed };
}

/**
 * 표시할 총 페이지 수를 계산
 * 크롤링 상태와 현재 단계에 따라 다른 소스 사용
 */
export function calculateTotalPages(
  progress: any, 
  statusSummary: any, 
  crawlingStatus: string,
  calculatedPageCount: number, 
  status: any, 
  config: any,
  tasks: any[]
) {
  // 기본값으로 계산된 페이지 범위, statusStore의 targetPageCount, 또는 config의 pageRangeLimit 사용
  let displayTotalPages: number | string = 
    (progress.currentStage === 1 && statusSummary?.actualTargetPageCountForStage1) || // 1단계일때 실제 크롤링 대상 페이지 사용
    calculatedPageCount || 
    status.targetPageCount || 
    config.pageRangeLimit || 
    '-';
  
  // 크롤링 상태에 따른 표시 설정
  // 1단계 제품 정보 수집 단계에서는 사용자가 설정한 수집 대상 페이지 범위를 우선적으로 표시
  if (
    (crawlingStatus === 'running' && progress.currentStage === 1) || 
    crawlingStatus === 'completed_stage_1'
  ) {
    // 계산된 페이지 수가 있으면 우선 사용
    if (calculatedPageCount && calculatedPageCount > 0) {
      displayTotalPages = calculatedPageCount;
    }
    // 상태 저장소에서 targetPageCount를 다음으로 사용
    else if (status.targetPageCount && status.targetPageCount > 0) {
      displayTotalPages = status.targetPageCount;
    }
    // 사용자가 설정한 페이지 범위 제한을 다음으로 사용
    else if (config.pageRangeLimit && config.pageRangeLimit > 0) {
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
    // 상태 저장소에서 targetPageCount 사용 (상태 체크 버튼 클릭 시 설정됨)
    if (statusSummary?.actualTargetPageCountForStage1 && progress.currentStage === 1) { // 1단계일때 실제 크롤링 대상 페이지 사용
      displayTotalPages = statusSummary.actualTargetPageCountForStage1;
    } else if (status.targetPageCount && status.targetPageCount > 0) {
      displayTotalPages = status.targetPageCount;
    }
    // 상태 요약 정보가 있는 경우 (상태 체크 후)
    else if (statusSummary && statusSummary.siteTotalPages > 0) {
      // 진행 상황의 총 페이지 수
      displayTotalPages = statusSummary.siteTotalPages;
    } 
    // 진행 정보에 totalPages가 있는 경우
    else if (progress.totalPages && progress.totalPages > 0) {
      displayTotalPages = progress.totalPages;
    }
    // tasks 배열에 크롤링할 페이지가 있는 경우 (기존 fallback)
    else if (tasks && tasks.length > 0) {
      displayTotalPages = tasks.length;
    }
  }
  
  return displayTotalPages;
}
