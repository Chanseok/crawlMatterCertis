// test-validation-vitest.js - Run with npx vitest run
import { describe, it, expect, beforeEach } from 'vitest';
import { UnifiedCrawlingProgressViewModel } from './src/ui/viewModels/UnifiedCrawlingProgressViewModel';

// 테스트 데이터
const mockData = {
  // 테스트 1: 완료 시 오류 표시 문제
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
  
  // 테스트 2: 수집 현황 불일치 문제
  inconsistentCompletion: {
    stage: 'complete',
    status: 'completed',
    percentage: 100,
    currentStep: '크롤링 완료',
    currentStage: 2,
    processedItems: 46,
    totalItems: 48
  },
  
  // 테스트 3: 페이지/제품 혼합 표시 문제
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

describe('UI 동기화 문제 해결 검증', () => {
  let viewModel;
  
  beforeEach(() => {
    viewModel = new UnifiedCrawlingProgressViewModel();
  });
  
  it('완료 시 오류 표시 문제가 해결되었는지 검증', () => {
    // Given: 오류 상태로 먼저 설정
    viewModel.updateFromProgress({
      ...mockData.completionWithError,
      status: 'error',
      percentage: 95
    });
    
    // When: 완료 이벤트 발생
    viewModel.markComplete(mockData.completionWithError);
    
    // Then: 완료 상태이면서 오류 상태가 아니어야 함
    const statusDisplay = viewModel.statusDisplay;
    expect(statusDisplay.isComplete).toBe(true);
    expect(statusDisplay.isError).toBe(false);
  });
  
  it('제품 수집 현황 불일치 문제가 해결되었는지 검증', () => {
    // Given: 46/48 상황에서
    viewModel.updateFromProgress(mockData.inconsistentCompletion);
    
    // When: 완료 이벤트 발생
    viewModel.markComplete(mockData.inconsistentCompletion);
    
    // Then: processed와 total이 일치해야 함 (48/48)
    const collectionDisplay = viewModel.collectionDisplay;
    expect(collectionDisplay.processed).toBe(collectionDisplay.total);
    expect(collectionDisplay.total).toBe(mockData.inconsistentCompletion.totalItems);
  });
  
  it('페이지와 제품 정보가 분리되어 표시되는지 검증', () => {
    // Given & When: 페이지와 제품 수가 혼합된 데이터 수신
    viewModel.updateFromProgress(mockData.mixedPageProductDisplay);
    
    // Then: 페이지 정보와 제품 정보가 올바르게 분리되어야 함
    const pageDisplay = viewModel.pageDisplay;
    expect(pageDisplay.current).toBe(mockData.mixedPageProductDisplay.currentPage);
    expect(pageDisplay.total).toBe(mockData.mixedPageProductDisplay.totalPages);
    
    const collectionDisplay = viewModel.collectionDisplay;
    expect(collectionDisplay.processed).toBe(mockData.mixedPageProductDisplay.processedItems);
    
    // 페이지 정보가 제품 정보에 섞이지 않아야 함
    expect(collectionDisplay.displayText.includes('페이지')).toBe(false);
  });
});
