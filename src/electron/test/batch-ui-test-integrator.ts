/**
 * batch-ui-test-integrator.ts
 * 
 * 배치 처리 UI 테스트를 애플리케이션에 통합하기 위한 모듈
 */

import { app, ipcMain } from 'electron';
import { simulateBatchProcessing } from './batch-ui-test.js';

export function setupBatchUITestHandlers() {
  // IPC 핸들러 등록: 배치 처리 UI 테스트 시작
  ipcMain.handle('startBatchUITest', async (event, args) => {
    const { totalBatches = 5, delayBetweenBatches = 3000 } = args || {};
    
    console.log(`[batch-ui-test-integrator] 배치 UI 테스트 시작: ${totalBatches}개 배치, ${delayBetweenBatches}ms 지연`);
    
    try {
      // 비동기로 시뮬레이션 시작 (UI 차단하지 않음)
      simulateBatchProcessing(totalBatches, delayBetweenBatches)
        .catch((err: Error) => console.error('[batch-ui-test-integrator] 배치 처리 시뮬레이션 오류:', err));
      
      return { success: true, message: '배치 처리 테스트가 시작되었습니다.' };
    } catch (error) {
      console.error('[batch-ui-test-integrator] 배치 UI 테스트 시작 오류:', error);
      return { success: false, error: String(error) };
    }
  });
  
  console.log('[batch-ui-test-integrator] 배치 UI 테스트 핸들러가 설정되었습니다.');
}
