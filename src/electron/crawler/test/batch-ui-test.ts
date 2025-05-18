/**
 * 배치 처리 UI 테스트 모듈
 * 
 * 크롤링 없이 배치 처리 UI만 테스트하기 위한 간단한 유틸리티
 */

import { crawlerEvents, CRAWLING_STAGE } from '../utils/progress.js';

/**
 * 배치 처리 UI 테스트를 위한 이벤트 시뮬레이션 함수
 * @param batchCount 시뮬레이션할 총 배치 수
 * @param delayMs 각 배치 간 지연 시간 (ms)
 * @returns Promise that resolves when simulation is complete
 */
export async function simulateBatchProcessing(batchCount = 5, delayMs = 2000): Promise<void> {
  console.log(`[BatchUITest] 배치 처리 UI 테스트 시작: ${batchCount}개 배치, ${delayMs}ms 지연`);

  // 테스트 시작 시간
  const startTime = Date.now();
  
  // 초기 상태 설정 (테스트 시작)
  crawlerEvents.emit('crawlingProgress', {
    status: 'running',
    current: 0,
    total: 100,
    percentage: 0,
    currentStep: '배치 처리 테스트 중',
    currentStage: CRAWLING_STAGE.PRODUCT_LIST,
    elapsedTime: 0,
    message: '배치 처리 UI 테스트가 시작되었습니다.',
    startTime,
    totalPages: batchCount * 10, // 가상 페이지 수
    currentPage: 0
  });
  
  // 각 배치별 처리 시뮬레이션
  for (let batch = 1; batch <= batchCount; batch++) {
    // 각 배치 진행 정보 업데이트
    const elapsedTime = Date.now() - startTime;
    const percentage = (batch / batchCount) * 100;
    const pagesPerBatch = 10; // 배치당 가상 페이지 수
    
    console.log(`[BatchUITest] 배치 ${batch}/${batchCount} 처리 중 (${percentage.toFixed(1)}%)`);
    
    // 배치 정보 포함한 진행 상태 이벤트 발생
    crawlerEvents.emit('crawlingProgress', {
      status: 'running',
      current: batch * (100 / batchCount),
      total: 100,
      percentage,
      currentStep: '배치 처리 테스트 중',
      currentStage: CRAWLING_STAGE.PRODUCT_LIST,
      elapsedTime,
      currentBatch: batch,
      totalBatches: batchCount,
      message: `배치 처리 중: ${batch}/${batchCount} 배치`,
      currentPage: batch * pagesPerBatch,
      totalPages: batchCount * pagesPerBatch,
      startTime
    });
    
    // 배치 간 지연
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  
  // 완료 상태로 업데이트
  const finalElapsedTime = Date.now() - startTime;
  console.log(`[BatchUITest] 배치 처리 UI 테스트 완료: ${finalElapsedTime / 1000}초 소요`);
  
  crawlerEvents.emit('crawlingProgress', {
    status: 'completed',
    current: 100,
    total: 100,
    percentage: 100,
    currentStep: '배치 처리 테스트 완료',
    currentStage: CRAWLING_STAGE.PRODUCT_LIST,
    elapsedTime: finalElapsedTime,
    currentBatch: batchCount,
    totalBatches: batchCount,
    message: `배치 처리 UI 테스트가 완료되었습니다.`,
    currentPage: batchCount * 10,
    totalPages: batchCount * 10,
    startTime
  });
  
  // 완료 이벤트 발생
  crawlerEvents.emit('crawlingComplete', {
    success: true,
    count: batchCount * 10,
    autoSavedToDb: false
  });
}
