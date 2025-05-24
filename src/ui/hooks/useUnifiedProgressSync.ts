/**
 * useProgressSync.ts
 * Clean Architecture 기반 데이터 동기화 Hook
 * 
 * 책임:
 * - IPC 이벤트와 ViewModel 간 완전한 데이터 동기화
 * - 모든 관련 이벤트의 통합 처리
 * - 데이터 일관성 보장
 */

import { useEffect } from 'react';
import { useProgressViewModel } from '../stores/ProgressStore';
import type { CrawlingProgress } from '../../../types';

/**
 * 크롤링 진행 상태 동기화 Hook
 * IPC 이벤트를 ViewModel로 통합하여 UI 일관성 보장
 */
export function useProgressSync(): void {
  const viewModel = useProgressViewModel();

  useEffect(() => {
    /**
     * 통합 이벤트 핸들러
     * 모든 크롤링 관련 이벤트를 단일 함수에서 처리
     */
    const handleProgressUpdate = (event: any, data: CrawlingProgress) => {
      console.log('[ProgressSync] Event received:', event?.type || 'unknown', data);
      
      // 완전한 데이터 매핑 및 검증
      const mappedData: Partial<CrawlingProgress> = {
        // 기본 상태
        stage: data.stage,
        status: data.status,
        percentage: data.percentage,
        currentStep: data.currentStep,
        
        // 페이지 관련
        currentPage: data.currentPage || data.current,
        totalPages: data.totalPages || data.total,
        
        // 아이템 관련
        processedItems: data.processedItems,
        totalItems: data.totalItems,
        newItems: data.newItems,
        updatedItems: data.updatedItems,
        
        // 시간 관련
        elapsedTime: data.elapsedTime,
        remainingTime: data.remainingTime,
        
        // 단계 정보
        currentStage: data.currentStage,
        
        // 오류 정보 - message를 사용 (errorMessage 필드는 존재하지 않음)
        message: data.message
      };

      // ViewModel 업데이트
      viewModel.updateFromRawProgress(mappedData);
    };

    /**
     * 완료 상태 전용 핸들러
     */
    const handleCompletionEvent = (_event: any, data: any) => {
      console.log('[ProgressSync] Completion event:', data);
      
      viewModel.updateFromRawProgress({
        ...data,
        status: 'completed',
        percentage: 100,
        currentStep: '크롤링 완료'
      });
    };

    /**
     * 오류 상태 전용 핸들러
     */
    const handleErrorEvent = (_event: any, data: any) => {
      console.log('[ProgressSync] Error event:', data);
      
      viewModel.updateFromRawProgress({
        ...data,
        status: 'error',
        currentStep: data.message || '오류 발생',
        errorMessage: data.message || data.error
      });
    };


    // 구독 함수들을 저장할 배열
    const unsubscribeFunctions: (() => void)[] = [];

    // 이벤트 리스너를 구독 방식으로 등록
    if (window.electron) {
      try {
        // 진행 상태 이벤트 구독
        const unsubscribeProgress = window.electron.subscribeCrawlingProgress((data) => {
          handleProgressUpdate(null, data);
        });
        unsubscribeFunctions.push(unsubscribeProgress);

        // 완료 이벤트 구독  
        const unsubscribeComplete = window.electron.subscribeCrawlingComplete((data) => {
          handleCompletionEvent(null, data);
        });
        unsubscribeFunctions.push(unsubscribeComplete);

        // 오류 이벤트 구독
        const unsubscribeError = window.electron.subscribeCrawlingError((data) => {
          handleErrorEvent(null, data);
        });
        unsubscribeFunctions.push(unsubscribeError);

        console.log('[ProgressSync] Event subscriptions registered');
      } catch (error) {
        console.warn('[ProgressSync] Failed to register subscriptions:', error);
      }
    }

    // 초기 상태 요청
    window.electron?.checkCrawlingStatus()
      .then((initialStatus) => {
        if (initialStatus) {
          console.log('[ProgressSync] Initial status loaded:', initialStatus);
          // Type casting to match expected format
          const progressData = initialStatus as any; // Temporary casting for compatibility
          viewModel.updateFromRawProgress(progressData);
        }
      })
      .catch((error) => {
        console.warn('[ProgressSync] Failed to load initial status:', error);
      });

    // 정리 함수
    return () => {
      unsubscribeFunctions.forEach(unsubscribe => {
        try {
          unsubscribe();
        } catch (error) {
          console.warn('[ProgressSync] Error during cleanup:', error);
        }
      });
      console.log('[ProgressSync] Event listeners cleaned up');
    };
  }, [viewModel]);
}

/**
 * Legacy Compatibility Hook
 * 기존 컴포넌트들과의 호환성을 위한 Hook
 */
export function useProgressDisplay() {
  const viewModel = useProgressViewModel();
  
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
    
    // 새로운 통합 Display Properties
    collectionDisplay: viewModel.collectionDisplay,
    progressDisplay: viewModel.progressDisplay,
    statusDisplay: viewModel.statusDisplay,
    timeDisplay: viewModel.timeDisplay
  };
}
