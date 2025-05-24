/**
 * useUnifiedProgressSync.ts
 * Clean Architecture 기반 통합 데이터 동기화 Hook
 * 
 * 책임:
 * - IPC 이벤트와 UnifiedViewModel 간 완전한 데이터 동기화
 * - 모든 관련 이벤트의 통합 처리 (진행, 완료, 오류)
 * - 3가지 UI 동기화 문제 완전 해결
 */

import { useEffect } from 'react';
import { useProgressViewModel } from '../stores/ProgressStore';
import type { CrawlingProgress } from '../../../types';

/**
 * 통합 크롤링 진행 상태 동기화 Hook
 * IPC 이벤트를 UnifiedViewModel로 완전히 동기화하여 3가지 원본 문제 해결
 */
export function useUnifiedProgressSync(): void {
  const viewModel = useProgressViewModel();

  useEffect(() => {
    /**
     * 진행 상태 업데이트 핸들러
     * 모든 크롤링 진행 이벤트를 통합 처리
     */
    const handleProgressUpdate = (_event: any, data: CrawlingProgress) => {
      console.log('[UnifiedProgressSync] Progress event:', data);
      
      // 완전한 데이터 매핑 및 검증
      const mappedData: Partial<CrawlingProgress> = {
        // 기본 상태
        stage: data.stage,
        status: data.status,
        percentage: data.percentage,
        currentStep: data.currentStep,
        currentStage: data.currentStage,
        
        // 페이지 관련 (다양한 필드명 지원)
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
        
        // 오류 정보
        message: data.message
      };

      // ViewModel로 업데이트 전달
      viewModel.updateFromRawProgress(mappedData);
    };

    /**
     * 완료 상태 전용 핸들러 
     * 원본 문제 #1, #2, #3 해결을 위한 명시적 완료 처리
     */
    const handleCompletionEvent = (_event: any, data: any) => {
      console.log('[UnifiedProgressSync] Completion event:', data);
      
      // 먼저 최종 진행 데이터 업데이트
      if (data.processedItems && data.totalItems) {
        viewModel.updateFromRawProgress({
          ...data,
          processedItems: data.totalItems, // 완료 시 처리 항목을 총 항목과 일치시킴
          percentage: 100
        });
      }
      
      // 명시적 완료 상태 설정
      viewModel.markComplete();
    };

    /**
     * 오류 상태 전용 핸들러
     */
    const handleErrorEvent = (_event: any, data: any) => {
      console.log('[UnifiedProgressSync] Error event:', data);
      
      const errorMessage = data.message || data.error || '알 수 없는 오류가 발생했습니다';
      viewModel.markError(errorMessage, data.isRecoverable !== false);
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

        console.log('[UnifiedProgressSync] Event subscriptions registered');
      } catch (error) {
        console.warn('[UnifiedProgressSync] Failed to register subscriptions:', error);
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
