import { observer } from 'mobx-react-lite';
import { progressStore } from '../stores/ProgressStore.js';
import { useUnifiedProgressSync } from './useUnifiedProgressSync.js';
import type { CrawlingProgress } from '../../../types.js';

/**
 * 크롤링 진행 상태 동기화를 위한 커스텀 훅 (Legacy 호환성)
 * 
 * 이 훅은:
 * 1. 새로운 UnifiedProgressSync Hook을 사용
 * 2. 기존 컴포넌트들과의 호환성 보장
 * 3. ProgressStore의 UnifiedViewModel을 통해 상태 제공
 */
export function useProgressSync() {
  const viewModel = progressStore.viewModel;
  
  // 새로운 통합 동기화 Hook 사용
  useUnifiedProgressSync();

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
    
    // Legacy compatibility - these properties are no longer available in the new ViewModel
    // but kept for backward compatibility with components that might still use them
    currentStageInfo: null,
    rawProgress: null,
    debugInfo: null
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
