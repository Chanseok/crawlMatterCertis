/**
 * test-ui-direct.js
 * UI 동기화 문제 직접 테스트 스크립트
 */

// Import directly from the source TypeScript file
// This requires ts-node or equivalent to run
import { UnifiedCrawlingProgressViewModel } from './src/ui/viewModels/UnifiedCrawlingProgressViewModel.js';

// 테스트용 모의 크롤링 데이터
const mockCrawlingData = {
  // 테스트 케이스 1: 완료 상태와 오류 상태 충돌 시나리오
  completionWithError: {
    stage: 'detailCollection',
    status: 'completed',
    percentage: 100,
    currentStep: '크롤링 완료',
    currentStage: 2,
    processedItems: 46,
    totalItems: 48,
    message: '일부 오류 발생',
    error: 'API 연결 오류'
  },
  
  // 테스트 케이스 2: 46/48 상황에서 완료 시나리오
  inconsistentCompletion: {
    stage: 'complete',
    status: 'completed',
    percentage: 100,
    currentStep: '크롤링 완료',
    currentStage: 2,
    processedItems: 46,
    totalItems: 48
  },
  
  // 테스트 케이스 3: 페이지와 제품 수 혼합 표시 시나리오
  mixedPageProductDisplay: {
    stage: 'listCollection',
    status: 'running',
    percentage: 60,
    currentStep: '페이지 수집 중',
    currentStage: 1,
    currentPage: 3,
    totalPages: 5,
    processedItems: 48
  }
};

console.log('====== UI 동기화 문제 테스트 시작 ======');

// 테스트 1: 완료 시점에 오류 표시 문제 해결 검증
function testErrorResolution() {
  console.log('\n=== 테스트 1: 완료 시 오류 표시 문제 해결 검증 ===');
  
  const vm = new UnifiedCrawlingProgressViewModel();
  
  // 먼저 오류 상태로 설정
  vm.updateFromProgress({
    ...mockCrawlingData.completionWithError,
    status: 'error',
    percentage: 95
  });
  
  // 그 다음 완료 이벤트 전송
  vm.markComplete(mockCrawlingData.completionWithError);
  
  // 결과 확인
  const statusDisplay = vm.statusDisplay;
  const isErrorShownDespiteCompletion = statusDisplay.isError;
  const isCompletionStatus = statusDisplay.isComplete;
  
  console.log('완료 상태에서 오류 표시 여부:', isErrorShownDespiteCompletion ? '❌ 실패' : '✅ 성공');
  console.log('완료 상태 표시 여부:', isCompletionStatus ? '✅ 성공' : '❌ 실패');
  console.log('상태 텍스트:', statusDisplay.text);
  
  return !isErrorShownDespiteCompletion && isCompletionStatus;
}

// 테스트 2: 제품 수집 현황 불일치 문제 해결 검증
function testCollectionDisplayConsistency() {
  console.log('\n=== 테스트 2: 제품 수집 현황 불일치 문제 해결 검증 ===');
  
  const vm = new UnifiedCrawlingProgressViewModel();
  
  // 46/48 상황에서 완료 이벤트 전송
  vm.updateFromProgress(mockCrawlingData.inconsistentCompletion);
  vm.markComplete(mockCrawlingData.inconsistentCompletion);
  
  // 결과 확인
  const collectionDisplay = vm.collectionDisplay;
  const isConsistent = collectionDisplay.processed === collectionDisplay.total;
  
  console.log('수집 현황 일관성:', isConsistent ? '✅ 성공' : '❌ 실패');
  console.log('수집된 항목 수:', collectionDisplay.processed);
  console.log('전체 항목 수:', collectionDisplay.total);
  console.log('수집 현황 표시:', collectionDisplay.displayText);
  
  return isConsistent;
}

// 테스트 3: 페이지/제품 수 혼합 표시 문제 해결 검증
function testPageProductSeparation() {
  console.log('\n=== 테스트 3: 페이지/제품 수 혼합 표시 문제 해결 검증 ===');
  
  const vm = new UnifiedCrawlingProgressViewModel();
  
  // 페이지와 제품 수가 혼합된 데이터 전송
  vm.updateFromProgress(mockCrawlingData.mixedPageProductDisplay);
  
  // 결과 확인
  const pageDisplay = vm.pageDisplay;
  const collectionDisplay = vm.collectionDisplay;
  
  const hasCorrectPageInfo = pageDisplay.current === mockCrawlingData.mixedPageProductDisplay.currentPage &&
                             pageDisplay.total === mockCrawlingData.mixedPageProductDisplay.totalPages;
                             
  const hasCorrectProductInfo = collectionDisplay.processed === mockCrawlingData.mixedPageProductDisplay.processedItems;
  
  console.log('페이지 정보:', `${pageDisplay.current}/${pageDisplay.total} 페이지`);
  console.log('제품 정보:', `${collectionDisplay.processed} 항목`);
  console.log('페이지 정보 분리 여부:', hasCorrectPageInfo ? '✅ 성공' : '❌ 실패');
  console.log('제품 정보 분리 여부:', hasCorrectProductInfo ? '✅ 성공' : '❌ 실패');
  
  return hasCorrectPageInfo && hasCorrectProductInfo;
}

// 모든 테스트 실행
const results = {
  test1: testErrorResolution(),
  test2: testCollectionDisplayConsistency(),
  test3: testPageProductSeparation()
};

// 최종 결과 출력
console.log('\n====== 테스트 결과 요약 ======');
console.log('테스트 1 (오류 표시 문제):', results.test1 ? '✅ 성공' : '❌ 실패');
console.log('테스트 2 (수집 현황 불일치):', results.test2 ? '✅ 성공' : '❌ 실패');
console.log('테스트 3 (페이지/제품 혼합 표시):', results.test3 ? '✅ 성공' : '❌ 실패');

const allPassed = results.test1 && results.test2 && results.test3;
console.log('\n최종 결과:', allPassed ? '✅ 모든 테스트 통과' : '❌ 일부 테스트 실패');
