import { computed, makeObservable, observable, action } from 'mobx';
import type { CrawlingProgress } from '../../../types.js';

/**
 * 크롤링 진행 상태를 위한 ViewModel
 * 모든 UI 컴포넌트가 이 단일 진실 공급원(Single Source of Truth)을 참조
 */
export class CrawlingProgressViewModel {
  private _rawProgress: CrawlingProgress = {
    current: 0,
    total: 0,
    percentage: 0,
    currentStep: '준비 중',
    elapsedTime: 0,
    status: 'idle'
  };

  constructor() {
    makeObservable(this, {
      _rawProgress: observable,
      updateProgress: action,
      progressBarPercentage: computed,
      progressBarLabel: computed,
      progressBarColor: computed,
      detailCollectionStatus: computed,
      remainingTimeDisplay: computed,
      elapsedTimeDisplay: computed,
      isCompleted: computed,
      isIdle: computed,
      isError: computed,
      currentStageInfo: computed,
      debugInfo: computed
    } as any);
  }

  updateProgress(progress: Partial<CrawlingProgress>): void {
    this._rawProgress = { ...this._rawProgress, ...progress };
    console.log('[ViewModel] Progress updated:', {
      percentage: this.progressBarPercentage,
      detailStatus: this.detailCollectionStatus,
      remainingTime: this.remainingTimeDisplay,
      isCompleted: this.isCompleted
    });
  }

  // === 진행 상태바용 Computed Properties ===
  get progressBarPercentage(): number {
    // 완료 상태면 강제로 100%
    if (this.isCompleted) return 100;
    return Math.min(this._rawProgress.percentage || 0, 100);
  }

  get progressBarLabel(): string {
    if (this.isCompleted) return '완료';
    if (this.isIdle) return '준비 중';
    return `${this.progressBarPercentage.toFixed(1)}%`;
  }

  get progressBarColor(): string {
    if (this.isCompleted) return 'bg-green-500';
    if (this.isError) return 'bg-red-500';
    return 'bg-blue-500';
  }

  // === 제품 수집 현황용 Computed Properties ===
  get detailCollectionStatus(): {
    processed: number;
    total: number;
    displayText: string;
  } {
    const processed = this.isCompleted 
      ? (this._rawProgress.totalPages || this._rawProgress.total || 0)
      : (this._rawProgress.currentPage || this._rawProgress.current || 0);
    
    const total = this._rawProgress.totalPages || this._rawProgress.total || 0;
    
    return {
      processed,
      total,
      displayText: `${processed}/${total}`
    };
  }

  // === 시간 관련 Computed Properties ===
  get remainingTimeDisplay(): string {
    if (this.isCompleted) return '0초';
    if (this.isIdle) return '--';
    
    const remaining = this._rawProgress.remainingTime || 0;
    if (remaining <= 0) return '0초';
    
    return this.formatDuration(remaining);
  }

  get elapsedTimeDisplay(): string {
    const elapsed = this._rawProgress.elapsedTime || 0;
    return this.formatDuration(elapsed);
  }

  // === 상태 감지 Computed Properties ===
  get isCompleted(): boolean {
    return this._rawProgress.status === 'completed' ||
           this._rawProgress.stage === 'complete' ||
           this._rawProgress.percentage >= 100 ||
           (typeof this._rawProgress.currentStep === 'string' && this._rawProgress.currentStep.includes('완료'));
  }

  get isIdle(): boolean {
    return this._rawProgress.status === 'idle' || 
           !this._rawProgress.status;
  }

  get isError(): boolean {
    return this._rawProgress.status === 'error' ||
           this._rawProgress.stage === 'error';
  }

  get currentStageInfo(): {
    stage: number;
    label: string;
    isActive: boolean;
  } {
    const stage = this._rawProgress.currentStage || 1;
    const isActive = !this.isCompleted && !this.isIdle;
    
    const stageLabels: Record<number, string> = {
      1: '제품 목록 수집',
      2: '제품 상세 수집',
      0: '완료'
    };
    
    return {
      stage: this.isCompleted ? 0 : stage,
      label: stageLabels[this.isCompleted ? 0 : stage] || '진행 중',
      isActive
    };
  }

  // === 유틸리티 메서드 ===
  private formatDuration(ms: number): string {
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

  // === 디버깅용 ===
  get debugInfo(): object {
    return {
      raw: this._rawProgress,
      computed: {
        progressBarPercentage: this.progressBarPercentage,
        detailCollectionStatus: this.detailCollectionStatus,
        remainingTimeDisplay: this.remainingTimeDisplay,
        isCompleted: this.isCompleted
      }
    };
  }

  // === 원본 데이터 접근용 (필요한 경우) ===
  get rawProgress(): CrawlingProgress {
    return { ...this._rawProgress };
  }
}
