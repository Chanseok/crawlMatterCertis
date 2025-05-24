import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { progressStore } from '../stores/ProgressStore.js';
import type { CrawlingProgress } from '../../../types.js';

/**
 * 크롤링 진행 상태 동기화를 위한 커스텀 훅
 * 
 * 이 훅은:
 * 1. Electron IPC로부터 진행 상태 업데이트를 수신
 * 2. ProgressStore의 ViewModel을 통해 상태를 업데이트
 * 3. MobX observer를 통해 자동으로 UI 리렌더링 트리거
 */
export function useProgressSync() {
  const viewModel = progressStore.viewModel;

  useEffect(() => {
    // IPC 구독 콜백 함수
    const handleProgressUpdate = (progress: CrawlingProgress) => {
      console.log('[useProgressSync] Received progress update:', progress);
      progressStore.updateProgress(progress);
    };

    // Electron IPC 구독 시작
    let unsubscribe: (() => void) | undefined;
    
    if (window.electron && window.electron.subscribeCrawlingProgress) {
      console.log('[useProgressSync] Setting up IPC subscription');
      unsubscribe = window.electron.subscribeCrawlingProgress(handleProgressUpdate);
    } else {
      console.warn('[useProgressSync] Electron API not available - running in development mode?');
    }

    // 컴포넌트 언마운트 시 구독 해제
    return () => {
      if (unsubscribe) {
        console.log('[useProgressSync] Cleaning up IPC subscription');
        unsubscribe();
      }
    };
  }, []);

  // ViewModel의 computed properties들을 반환
  return {
    // 진행 상태바용
    progressBarPercentage: viewModel.progressBarPercentage,
    progressBarLabel: viewModel.progressBarLabel,
    progressBarColor: viewModel.progressBarColor,
    
    // 제품 수집 현황용
    detailCollectionStatus: viewModel.detailCollectionStatus,
    
    // 시간 관련
    remainingTimeDisplay: viewModel.remainingTimeDisplay,
    elapsedTimeDisplay: viewModel.elapsedTimeDisplay,
    
    // 상태 감지
    isCompleted: viewModel.isCompleted,
    isIdle: viewModel.isIdle,
    isError: viewModel.isError,
    
    // 현재 단계 정보
    currentStageInfo: viewModel.currentStageInfo,
    
    // 원본 데이터 (필요한 경우)
    rawProgress: viewModel.rawProgress,
    
    // 디버깅용
    debugInfo: viewModel.debugInfo
  };
}

/**
 * 진행 상태를 사용하는 컴포넌트를 MobX observer로 감싸는 HOC
 * 
 * 사용법:
 * export default withProgressObserver(MyComponent);
 */
export function withProgressObserver<T extends Record<string, any>>(Component: React.ComponentType<T>) {
  // Type assertion to work around MobX observer typing limitations
  return observer(Component as any) as React.ComponentType<T>;
}

/**
 * 진행 상태 관련 액션들을 제공하는 훅
 */
export function useProgressActions() {
  return {
    /**
     * 수동으로 진행 상태 업데이트
     */
    updateProgress: (progress: Partial<CrawlingProgress>) => {
      progressStore.updateProgress(progress);
    },
    
    /**
     * 디버그 정보 조회
     */
    getDebugInfo: () => {
      return progressStore.getDebugInfo();
    },
    
    /**
     * 진행 상태 리셋 (필요한 경우)
     */
    resetProgress: () => {
      progressStore.updateProgress({
        current: 0,
        total: 0,
        percentage: 0,
        currentStep: '준비 중',
        elapsedTime: 0,
        status: 'idle'
      });
    }
  };
}
