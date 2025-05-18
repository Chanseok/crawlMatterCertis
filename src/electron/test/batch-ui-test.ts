/**
 * batch-ui-test.ts
 * 
 * 배치 처리 시각화 UI 테스트를 위한 스크립트
 * 실제 크롤링을 수행하지 않고 배치 처리 이벤트만 발생시켜 UI 테스트를 수행합니다.
 */

import { crawlerEvents, CRAWLING_STAGE } from "../crawler/utils/progress.js";

// import { crawlerEvents } from '../crawler/utils/progress';
// import { CRAWLING_STAGE } from '../crawler/utils/progress';

/**
 * 배치 처리 테스트 함수
 * @param totalBatches 총 배치 수
 * @param delayBetweenBatches 배치 간 지연 시간 (ms)
 */
export async function simulateBatchProcessing(totalBatches: number = 5, delayBetweenBatches: number = 3000): Promise<void> {
  console.log(`[batch-ui-test] 배치 처리 시뮬레이션 시작: 총 ${totalBatches}개 배치`);
  
  // 초기 진행 상태 설정
  const startTime = Date.now();
  crawlerEvents.emit('crawlingProgress', {
    status: 'running',
    current: 0,
    total: 100,
    percentage: 0,
    currentStep: '배치 처리 테스트 실행 중',
    currentStage: CRAWLING_STAGE.PRODUCT_LIST,
    elapsedTime: 0,
    message: '배치 처리 테스트가 시작되었습니다',
    totalPages: 100,
    currentPage: 0,
    startTime
  });
  
  // 각 배치 반복 처리
  for (let batch = 1; batch <= totalBatches; batch++) {
    const elapsedTime = Date.now() - startTime;
    const percentage = (batch / totalBatches) * 100;
    
    console.log(`[batch-ui-test] 배치 ${batch}/${totalBatches} 처리 중 (${percentage.toFixed(1)}%)`);
    
    // 현재 배치 정보를 포함한 진행 이벤트 발생
    crawlerEvents.emit('crawlingProgress', {
      status: 'running',
      current: batch * (100 / totalBatches),
      total: 100,
      percentage,
      currentStep: '배치 처리 테스트',
      currentStage: CRAWLING_STAGE.PRODUCT_LIST,
      elapsedTime,
      currentBatch: batch,
      totalBatches,
      message: `배치 처리 중: ${batch}/${totalBatches} 배치`,
      // 아래는 1단계(목록 수집) 관련 정보
      currentPage: batch * 10, // 가상의 페이지 진행 상황
      totalPages: totalBatches * 10,
      startTime
    });
    
    // 다음 배치 전 지연
    await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
  }
  
  // 완료 이벤트 발생
  const finalElapsedTime = Date.now() - startTime;
  console.log(`[batch-ui-test] 배치 처리 시뮬레이션 완료: ${finalElapsedTime / 1000}초 소요`);
  
  crawlerEvents.emit('crawlingProgress', {
    status: 'completed',
    current: 100,
    total: 100,
    percentage: 100,
    currentStep: '배치 처리 테스트 완료',
    currentStage: CRAWLING_STAGE.PRODUCT_LIST,
    elapsedTime: finalElapsedTime,
    currentBatch: totalBatches,
    totalBatches,
    message: `배치 처리 테스트가 완료되었습니다. 총 ${totalBatches}개 배치 처리됨`,
    currentPage: totalBatches * 10,
    totalPages: totalBatches * 10,
    startTime
  });
  
  // 크롤링 완료 이벤트 발생
  crawlerEvents.emit('crawlingComplete', {
    success: true,
    count: totalBatches * 10,
    autoSavedToDb: false
  });
}

// Node.js 환경에서 직접 실행된 경우 (Electron 메인 프로세스에서 테스트용)
// Using import.meta.url to check if file is directly executed
// This is the ESM equivalent of 'require.main === module'
const isDirectlyExecuted = import.meta.url === `file://${process.argv[1]}`;
if (isDirectlyExecuted) {
  simulateBatchProcessing()
    .then(() => console.log('배치 처리 테스트 완료'))
    .catch((err: Error) => console.error('배치 처리 테스트 실패:', err));
}
