/**
 * CrawlingProgressViewModel.ts
 * Clean ViewModel 패턴 기반 크롤링 진행 상태 관리
 * 
 * 책임:
 * - 단일 데이터 소스로서 모든 UI 상태 통합 관리
 * - 원시 데이터를 UI 표시용 구조체로 변환
 * - 데이터 일관성 보장 및 자동 검증
 */

import { makeObservable, observable, computed, action } from 'mobx';
import type { CrawlingProgress } from '../../../types';
import type { 
  UnifiedCrawlingState, 
  CollectionDisplay, 
  ProgressDisplay, 
  StatusDisplay,
  CrawlingStatusInfo,
  TimeInfo
} from '../types/CrawlingViewTypes';

/**
 * 통합 크롤링 상태 ViewModel
 * 모든 UI 컴포넌트의 단일 진실 원본(Single Source of Truth)
 */
export class CrawlingProgressViewModel {
  private _state: UnifiedCrawlingState = observable({
    stage: 'idle',
    percentage: 0,
    currentStep: '대기 중...',
    detailCollection: { processed: 0, total: 0 },
    pageProgress: { current: 0, total: 0 },
    itemCounts: { new: 0, updated: 0 },
    isComplete: false,
    hasError: false,
    timeInfo: { 
      elapsed: 0, 
      remaining: 0, 
      remainingDisplay: '--' 
    }
  });

  constructor() {
    makeObservable(this, {
      updateFromRawProgress: action,
      validateAndFixState: action,
      
      // UI Display Computed Properties
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
   */
  updateFromRawProgress(progress: Partial<CrawlingProgress>): void {
    // 원시 데이터 보존 (디버깅용)
    this._state._rawProgress = { ...this._state._rawProgress, ...progress };
    
    // 통합 상태 업데이트
    this._state.stage = progress.stage || this._state.stage;
    this._state.percentage = Math.min(progress.percentage || 0, 100);
    this._state.currentStep = progress.currentStep || this._state.currentStep;
    
    // 컬렉션 상태 업데이트 (단계별 정확한 매핑)
    this._updateCollectionState(progress);
    
    // 페이지 진행 상태 업데이트
    this._updatePageProgress(progress);
    
    // 아이템 카운트 업데이트
    this._updateItemCounts(progress);
    
    // 완료/오류 상태 업데이트
    this._updateCompletionState(progress);
    
    // 시간 정보 업데이트
    this._updateTimeInfo(progress);
    
    // 자동 검증 및 수정
    this.validateAndFixState();
    
    console.log('[ViewModel] State updated:', {
      collection: this.collectionDisplay,
      progress: this.progressDisplay,
      status: this.statusDisplay
    });
  }

  /**
   * 상태 일관성 검증 및 자동 수정
   */
  validateAndFixState(): void {
    // 1. 완료 상태이면서 수집된 항목이 총 항목보다 적을 때
    if (this._state.isComplete && 
        this._state.detailCollection.processed < this._state.detailCollection.total &&
        this._state.detailCollection.total > 0) {
      console.warn('[ViewModel] 불일치 수정: 완료 상태 시 처리된 항목을 총 항목으로 조정');
      this._state.detailCollection.processed = this._state.detailCollection.total;
    }
    
    // 2. 페이지 진행 상태 검증
    if (this._state.pageProgress.current > this._state.pageProgress.total &&
        this._state.pageProgress.total > 0) {
      console.warn('[ViewModel] 불일치 수정: 현재 페이지가 총 페이지보다 큰 경우');
      this._state.pageProgress.current = this._state.pageProgress.total;
    }
    
    // 3. 오류와 완료 상태 동시 발생 방지
    if (this._state.isComplete && this._state.hasError) {
      console.warn('[ViewModel] 불일치 수정: 완료와 오류 상태 동시 발생');
      // 오류 메시지가 있으면 오류 우선
      if (this._state.errorMessage) {
        this._state.isComplete = false;
      } else {
        this._state.hasError = false;
      }
    }
    
    // 4. 진행률과 완료 상태 일치 확인
    if (this._state.percentage >= 100 && !this._state.hasError && !this._state.isComplete) {
      console.log('[ViewModel] 자동 완료: 진행률 100% 도달');
      this._state.isComplete = true;
    }
  }

  // === UI Display Computed Properties ===
  
  /**
   * 제품 수집 현황 표시용 통합 데이터
   */
  get collectionDisplay(): CollectionDisplay {
    const { processed, total } = this._state.detailCollection;
    
    return {
      processed,
      total,
      displayText: `${processed}/${total}`,
      isComplete: this._state.isComplete && processed >= total
    };
  }

  /**
   * 진행 상태바 표시용 통합 데이터
   */
  get progressDisplay(): ProgressDisplay {
    const percentage = this._state.isComplete ? 100 : this._state.percentage;
    
    let barColor = 'bg-blue-500';
    if (this._state.isComplete) barColor = 'bg-green-500';
    else if (this._state.hasError) barColor = 'bg-red-500';
    
    return {
      percentage,
      barColor,
      isComplete: this._state.isComplete
    };
  }

  /**
   * 상태 표시용 통합 데이터
   */
  get statusDisplay(): StatusDisplay {
    let status: CrawlingStatusInfo;
    
    if (this._state.hasError) {
      status = {
        text: '오류 발생',
        className: 'text-red-500',
        iconType: 'error',
        isError: true,
        isComplete: false,
        isIdle: false
      };
    } else if (this._state.isComplete) {
      status = {
        text: '완료됨',
        className: 'text-green-500',
        iconType: 'success',
        isError: false,
        isComplete: true,
        isIdle: false
      };
    } else if (this._state.stage === 'idle') {
      status = {
        text: '대기 중',
        className: 'text-gray-500',
        iconType: 'idle',
        isError: false,
        isComplete: false,
        isIdle: true
      };
    } else {
      status = {
        text: '진행 중',
        className: 'text-blue-500',
        iconType: 'loading',
        isError: false,
        isComplete: false,
        isIdle: false
      };
    }
    
    return {
      ...status,
      showErrorButton: this._state.hasError && !!this._state.errorMessage
    };
  }

  /**
   * 시간 표시용 통합 데이터
   */
  get timeDisplay(): TimeInfo {
    const { elapsed, remaining } = this._state.timeInfo;
    
    let remainingDisplay = '--';
    if (this._state.isComplete) {
      remainingDisplay = '0초';
    } else if (remaining > 0 && this._state.percentage < 99.9) {
      remainingDisplay = this._formatDuration(remaining);
    } else if (this._state.stage !== 'idle') {
      remainingDisplay = '곧 완료';
    }
    
    return {
      elapsed,
      remaining,
      remainingDisplay
    };
  }

  // === Legacy Compatibility Properties ===
  
  get progressBarPercentage(): number {
    return this.progressDisplay.percentage;
  }

  get progressBarLabel(): string {
    if (this._state.isComplete) return '완료';
    if (this._state.stage === 'idle') return '준비 중';
    return `${this.progressDisplay.percentage.toFixed(1)}%`;
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
    return this._formatDuration(this._state.timeInfo.elapsed);
  }

  get isCompleted(): boolean {
    return this._state.isComplete;
  }

  get isIdle(): boolean {
    return this._state.stage === 'idle';
  }

  get isError(): boolean {
    return this._state.hasError;
  }

  // === Private Helper Methods ===

  private _updateCollectionState(progress: Partial<CrawlingProgress>): void {
    const currentStage = progress.currentStage || this._state._rawProgress?.currentStage || 1;
    
    if (currentStage === 2) {
      // 2단계: 제품 상세 수집
      this._state.detailCollection.processed = progress.processedItems || this._state.detailCollection.processed;
      this._state.detailCollection.total = progress.totalItems || this._state.detailCollection.total;
    } else {
      // 1단계: 페이지 수집을 detailCollection으로 매핑
      this._state.detailCollection.processed = progress.currentPage || this._state.detailCollection.processed;
      this._state.detailCollection.total = progress.totalPages || this._state.detailCollection.total;
    }
  }

  private _updatePageProgress(progress: Partial<CrawlingProgress>): void {
    this._state.pageProgress.current = progress.currentPage || this._state.pageProgress.current;
    this._state.pageProgress.total = progress.totalPages || this._state.pageProgress.total;
  }

  private _updateItemCounts(progress: Partial<CrawlingProgress>): void {
    this._state.itemCounts.new = progress.newItems || this._state.itemCounts.new;
    this._state.itemCounts.updated = progress.updatedItems || this._state.itemCounts.updated;
  }

  private _updateCompletionState(progress: Partial<CrawlingProgress>): void {
    // 완료 상태 감지
    if (progress.status === 'completed' || 
        progress.stage === 'complete' ||
        (progress.percentage !== undefined && progress.percentage >= 100 && progress.status !== 'error')) {
      this._state.isComplete = true;
    }
    
    // 오류 상태 감지
    if (progress.status === 'error' || 
        progress.stage === 'error' ||
        progress.currentStep?.includes('오류') ||
        progress.currentStep?.includes('실패')) {
      this._state.hasError = true;
      this._state.errorMessage = progress.message || progress.currentStep;
    }
  }

  private _updateTimeInfo(progress: Partial<CrawlingProgress>): void {
    this._state.timeInfo.elapsed = progress.elapsedTime || this._state.timeInfo.elapsed;
    this._state.timeInfo.remaining = progress.remainingTime || this._state.timeInfo.remaining;
  }

  private _formatDuration(ms: number): string {
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
