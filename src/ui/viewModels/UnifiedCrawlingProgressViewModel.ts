/**
 * UnifiedCrawlingProgressViewModel.ts
 * Clean Architecture 기반 통합 크롤링 진행 상태 관리
 * 
 * 책임:
 * - 모든 UI 컴포넌트의 Single Source of Truth
 * - 원시 데이터를 UI 표시용 구조체로 변환
 * - 상태 일관성 자동 검증 및 보정
 * - 3가지 UI 동기화 문제 완전 해결
 */

import { makeObservable, observable, computed, action } from 'mobx';
import type { CrawlingProgress } from '../../../types';
import type { 
  UnifiedCrawlingState, 
  CollectionDisplay, 
  ProgressDisplay, 
  StatusDisplay,
  TimeDisplay
} from '../types/CrawlingViewTypes';

/**
 * 통합 크롤링 상태 ViewModel
 * 모든 UI 컴포넌트의 단일 진실 원본(Single Source of Truth)
 */
export class UnifiedCrawlingProgressViewModel {
  private _state: UnifiedCrawlingState = observable({
    // 단계 정보
    phase: {
      current: 'idle',
      description: '대기 중...',
      stageNumber: 0
    },
    
    // 진행 정보
    progress: {
      percentage: 0,
      isComplete: false
    },
    
    // 항목 처리 정보 (모든 UI가 참조할 단일 소스)
    items: {
      processed: 0,
      total: 0,
      new: 0,
      updated: 0
    },
    
    // 페이지 처리 정보
    pages: {
      current: 0,
      total: 0
    },
    
    // 시간 정보
    time: {
      elapsed: 0,
      remaining: 0,
      formattedElapsed: '0초',
      formattedRemaining: '--'
    },
    
    // 오류 정보
    error: {
      hasError: false,
      message: null,
      isRecoverable: true
    },
    
    // 원본 진행 데이터 (디버깅용)
    _rawProgress: {}
  });

  constructor() {
    makeObservable(this, {
      updateFromRawProgress: action,
      markComplete: action,
      markError: action,
      reset: action,
      
      // UI Display Computed Properties - 구조적 일관성 보장
      collectionDisplay: computed,
      progressDisplay: computed,
      statusDisplay: computed,
      timeDisplay: computed,
      
      // Legacy Compatibility (기존 컴포넌트 지원)
      progressBarPercentage: computed,
      progressBarLabel: computed,
      progressBarColor: computed,
      detailCollectionStatus: computed,
      remainingTimeDisplay: computed,
      elapsedTimeDisplay: computed,
      isCompleted: computed,
      isIdle: computed,
      isError: computed
    });
  }

  // === Core State Management ===
  
  /**
   * 원시 진행 데이터를 통합 상태로 변환 및 업데이트
   * 모든 상태 업데이트의 단일 진입점
   */
  updateFromRawProgress(progress: Partial<CrawlingProgress>): void {
    // 원시 데이터 보존 (디버깅용)
    this._state._rawProgress = { ...this._state._rawProgress, ...progress };
    
    // 단계별 정확한 상태 매핑
    this._updatePhaseInfo(progress);
    this._updateProgressInfo(progress);
    this._updateItemsInfo(progress);
    this._updatePagesInfo(progress);
    this._updateTimeInfo(progress);
    this._updateErrorInfo(progress);
    
    // 상태 일관성 자동 검증 및 보정
    this._validateAndCorrectState();
    
    console.log('[ViewModel] State updated:', {
      phase: this._state.phase,
      items: `${this._state.items.processed}/${this._state.items.total}`,
      progress: `${this._state.progress.percentage}%`,
      isComplete: this._state.progress.isComplete
    });
  }

  /**
   * 크롤링 완료 처리 (완료 이벤트 전용)
   */
  markComplete(): void {
    this._state.progress.isComplete = true;
    this._state.progress.percentage = 100;
    this._state.phase.current = 'completed';
    this._state.phase.description = '크롤링 완료';
    
    // 완료 시 항목 수 일치 보장 (원본 문제 #2 해결)
    if (this._state.items.total > 0) {
      this._state.items.processed = this._state.items.total;
    }
    
    // 완료 시 시간 정보 최종화 (원본 문제 #3 해결)
    this._state.time.remaining = 0;
    this._state.time.formattedRemaining = '0초';
    
    this._state.error.hasError = false; // 완료 시 오류 상태 해제
    
    console.log('[ViewModel] Marked as complete');
  }

  /**
   * 오류 상태 처리
   */
  markError(message: string, isRecoverable: boolean = true): void {
    this._state.error.hasError = true;
    this._state.error.message = message;
    this._state.error.isRecoverable = isRecoverable;
    this._state.progress.isComplete = false; // 오류 시 완료 상태 해제
    
    console.log('[ViewModel] Marked as error:', message);
  }

  /**
   * 상태 초기화
   */
  reset(): void {
    this._state.phase.current = 'idle';
    this._state.phase.description = '대기 중...';
    this._state.phase.stageNumber = 0;
    
    this._state.progress.percentage = 0;
    this._state.progress.isComplete = false;
    
    this._state.items.processed = 0;
    this._state.items.total = 0;
    this._state.items.new = 0;
    this._state.items.updated = 0;
    
    this._state.pages.current = 0;
    this._state.pages.total = 0;
    
    this._state.time.elapsed = 0;
    this._state.time.remaining = 0;
    this._state.time.formattedElapsed = '0초';
    this._state.time.formattedRemaining = '--';
    
    this._state.error.hasError = false;
    this._state.error.message = null;
    this._state.error.isRecoverable = true;
    
    this._state._rawProgress = {};
    
    console.log('[ViewModel] Reset to initial state');
  }

  // === UI Display Computed Properties ===
  
  /**
   * 제품 수집 현황 표시용 통합 데이터
   * 원본 문제 #2 해결: 정확한 수집 현황 표시
   */
  get collectionDisplay(): CollectionDisplay {
    const { processed, total } = this._state.items;
    
    // 단계에 따른 적절한 표시 텍스트 결정
    let phaseText = '제품';
    if (this._state.phase.current === 'listCollection') {
      phaseText = '페이지';
    }
    
    return {
      processed,
      total,
      displayText: `${processed}/${total}`,
      isComplete: this._state.progress.isComplete || (total > 0 && processed >= total),
      phaseText
    };
  }

  /**
   * 진행 상태바 표시용 통합 데이터
   * 원본 문제 #1 해결: 완료 시 100% 채움 보장
   */
  get progressDisplay(): ProgressDisplay {
    // 완료 상태에서는 무조건 100% 표시
    const percentage = this._state.progress.isComplete ? 100 : Math.min(this._state.progress.percentage, 100);
    
    let barColor = 'bg-blue-500';
    let statusText = '진행 중';
    
    if (this._state.error.hasError) {
      barColor = 'bg-red-500';
      statusText = '오류 발생';
    } else if (this._state.progress.isComplete) {
      barColor = 'bg-green-500';
      statusText = '완료됨';
    } else if (this._state.phase.current === 'idle') {
      barColor = 'bg-gray-400';
      statusText = '대기 중';
    }
    
    return {
      percentage,
      barColor,
      isComplete: this._state.progress.isComplete,
      statusText
    };
  }

  /**
   * 상태 표시용 통합 데이터
   */
  get statusDisplay(): StatusDisplay {
    if (this._state.error.hasError) {
      return {
        text: '오류 발생',
        className: 'text-red-500',
        iconType: 'error',
        isError: true,
        isComplete: false,
        isIdle: false,
        showErrorButton: !!this._state.error.message
      };
    }
    
    if (this._state.progress.isComplete) {
      return {
        text: '완료됨',
        className: 'text-green-500',
        iconType: 'success',
        isError: false,
        isComplete: true,
        isIdle: false,
        showErrorButton: false
      };
    }
    
    if (this._state.phase.current === 'idle') {
      return {
        text: '대기 중',
        className: 'text-gray-500',
        iconType: 'idle',
        isError: false,
        isComplete: false,
        isIdle: true,
        showErrorButton: false
      };
    }
    
    return {
      text: this._state.phase.description || '진행 중',
      className: 'text-blue-500',
      iconType: 'loading',
      isError: false,
      isComplete: false,
      isIdle: false,
      showErrorButton: false
    };
  }

  /**
   * 시간 표시용 통합 데이터
   * 원본 문제 #3 해결: 완료 시 남은 시간 0초 표시
   */
  get timeDisplay(): TimeDisplay {
    const { elapsed, remaining } = this._state.time;
    
    let remainingDisplay = '--';
    if (this._state.progress.isComplete) {
      // 완료 시 무조건 0초 표시
      remainingDisplay = '0초';
    } else if (this._state.error.hasError) {
      remainingDisplay = '--';
    } else if (remaining > 0 && this._state.progress.percentage < 99.9) {
      remainingDisplay = this._formatDuration(remaining);
    } else if (this._state.phase.current !== 'idle' && this._state.progress.percentage > 90) {
      remainingDisplay = '곧 완료';
    }
    
    return {
      elapsed,
      remaining: this._state.progress.isComplete ? 0 : remaining,
      elapsedDisplay: this._formatDuration(elapsed),
      remainingDisplay,
      isComplete: this._state.progress.isComplete
    };
  }

  // === Legacy Compatibility Properties ===
  
  get progressBarPercentage(): number {
    return this.progressDisplay.percentage;
  }

  get progressBarLabel(): string {
    return this.progressDisplay.statusText;
  }

  get progressBarColor(): string {
    return this.progressDisplay.barColor;
  }

  get detailCollectionStatus(): { processed: number; total: number; displayText: string } {
    const display = this.collectionDisplay;
    return {
      processed: display.processed,
      total: display.total,
      displayText: display.displayText
    };
  }

  get remainingTimeDisplay(): string {
    return this.timeDisplay.remainingDisplay;
  }

  get elapsedTimeDisplay(): string {
    return this.timeDisplay.elapsedDisplay;
  }

  get isCompleted(): boolean {
    return this._state.progress.isComplete;
  }

  get isIdle(): boolean {
    return this._state.phase.current === 'idle';
  }

  get isError(): boolean {
    return this._state.error.hasError;
  }

  // === Private Helper Methods ===

  /**
   * 단계 정보 업데이트
   */
  private _updatePhaseInfo(progress: Partial<CrawlingProgress>): void {
    if (progress.stage) {
      this._state.phase.current = progress.stage as any;
    }
    
    if (progress.currentStep) {
      this._state.phase.description = progress.currentStep;
    }
    
    // 단계 번호 자동 매핑
    const currentStage = progress.currentStage || this._state._rawProgress?.currentStage || 1;
    this._state.phase.stageNumber = currentStage;
  }

  /**
   * 진행률 정보 업데이트
   */
  private _updateProgressInfo(progress: Partial<CrawlingProgress>): void {
    if (progress.percentage !== undefined) {
      this._state.progress.percentage = Math.min(Math.max(progress.percentage, 0), 100);
    }
    
    // 완료 상태 감지
    if (progress.status === 'completed' || 
        progress.stage === 'complete' ||
        (progress.percentage !== undefined && progress.percentage >= 100 && progress.status !== 'error')) {
      this._state.progress.isComplete = true;
    }
  }

  /**
   * 항목 처리 정보 업데이트 (Single Source of Truth)
   */
  private _updateItemsInfo(progress: Partial<CrawlingProgress>): void {
    const currentStage = this._state.phase.stageNumber;
    
    if (currentStage === 2) {
      // 2단계: 제품 상세 수집
      if (progress.processedItems !== undefined) {
        this._state.items.processed = progress.processedItems;
      }
      if (progress.totalItems !== undefined) {
        this._state.items.total = progress.totalItems;
      }
    } else if (currentStage === 1) {
      // 1단계: 페이지 수집을 items로 매핑
      if (progress.currentPage !== undefined) {
        this._state.items.processed = progress.currentPage;
      }
      if (progress.totalPages !== undefined) {
        this._state.items.total = progress.totalPages;
      }
    }
    
    // 아이템 카운트 업데이트
    if (progress.newItems !== undefined) {
      this._state.items.new = progress.newItems;
    }
    if (progress.updatedItems !== undefined) {
      this._state.items.updated = progress.updatedItems;
    }
  }

  /**
   * 페이지 처리 정보 업데이트
   */
  private _updatePagesInfo(progress: Partial<CrawlingProgress>): void {
    if (progress.currentPage !== undefined) {
      this._state.pages.current = progress.currentPage;
    }
    if (progress.totalPages !== undefined) {
      this._state.pages.total = progress.totalPages;
    }
  }

  /**
   * 시간 정보 업데이트
   */
  private _updateTimeInfo(progress: Partial<CrawlingProgress>): void {
    if (progress.elapsedTime !== undefined) {
      this._state.time.elapsed = progress.elapsedTime;
      this._state.time.formattedElapsed = this._formatDuration(progress.elapsedTime);
    }
    
    if (progress.remainingTime !== undefined) {
      this._state.time.remaining = progress.remainingTime;
      this._state.time.formattedRemaining = this._formatDuration(progress.remainingTime);
    }
  }

  /**
   * 오류 정보 업데이트
   */
  private _updateErrorInfo(progress: Partial<CrawlingProgress>): void {
    // 오류 상태 감지
    if (progress.status === 'error' || 
        progress.stage === 'error' ||
        progress.currentStep?.includes('오류') ||
        progress.currentStep?.includes('실패')) {
      this._state.error.hasError = true;
      this._state.error.message = progress.message || progress.currentStep || '알 수 없는 오류';
      this._state.progress.isComplete = false; // 오류 시 완료 상태 해제
    }
  }

  /**
   * 상태 일관성 자동 검증 및 보정
   * 3가지 원본 문제 및 추가 불일치 문제 해결
   */
  private _validateAndCorrectState(): void {
    // 1. 완료 상태 시 항목 수 일치 보장 (원본 문제 #2)
    if (this._state.progress.isComplete && 
        this._state.items.total > 0 && 
        this._state.items.processed < this._state.items.total) {
      console.warn('[ViewModel] 불일치 수정: 완료 상태 시 처리된 항목을 총 항목으로 조정');
      this._state.items.processed = this._state.items.total;
    }
    
    // 2. 완료 상태 시 진행률 100% 보장 (원본 문제 #1)
    if (this._state.progress.isComplete && this._state.progress.percentage < 100) {
      console.warn('[ViewModel] 불일치 수정: 완료 상태 시 진행률을 100%로 조정');
      this._state.progress.percentage = 100;
    }
    
    // 3. 완료 상태 시 남은 시간 0초 보장 (원본 문제 #3)
    if (this._state.progress.isComplete && this._state.time.remaining > 0) {
      console.warn('[ViewModel] 불일치 수정: 완료 상태 시 남은 시간을 0으로 조정');
      this._state.time.remaining = 0;
      this._state.time.formattedRemaining = '0초';
    }
    
    // 4. 오류와 완료 상태 충돌 해결
    if (this._state.progress.isComplete && this._state.error.hasError) {
      console.warn('[ViewModel] 불일치 수정: 완료와 오류 상태 충돌 해결');
      if (this._state.error.message) {
        this._state.progress.isComplete = false;
      } else {
        this._state.error.hasError = false;
      }
    }
    
    // 5. 페이지 진행 상태 검증
    if (this._state.pages.current > this._state.pages.total && this._state.pages.total > 0) {
      console.warn('[ViewModel] 불일치 수정: 현재 페이지가 총 페이지보다 큰 경우');
      this._state.pages.current = this._state.pages.total;
    }
    
    // 6. 진행률 범위 검증
    if (this._state.progress.percentage > 100) {
      console.warn('[ViewModel] 불일치 수정: 진행률이 100%를 초과');
      this._state.progress.percentage = 100;
    }
    
    // 7. 자동 완료 감지
    if (this._state.progress.percentage >= 100 && 
        !this._state.error.hasError && 
        !this._state.progress.isComplete &&
        this._state.items.total > 0 &&
        this._state.items.processed >= this._state.items.total) {
      console.log('[ViewModel] 자동 완료: 모든 조건 만족');
      this._state.progress.isComplete = true;
    }
  }

  /**
   * 시간 포맷팅 유틸리티
   */
  private _formatDuration(ms: number): string {
    if (ms <= 0) return '0초';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}시간 ${minutes % 60}분`;
    } else if (minutes > 0) {
      return `${minutes}분 ${seconds % 60}초`;
    } else {
      return `${seconds}초`;
    }
  }

  // === Debugging ===
  
  get debugState(): object {
    return {
      unified: this._state,
      displays: {
        collection: this.collectionDisplay,
        progress: this.progressDisplay,
        status: this.statusDisplay,
        time: this.timeDisplay
      }
    };
  }
}
