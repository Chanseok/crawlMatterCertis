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
    // 단계별로 정확한 데이터 소스 사용
    const currentStage = this._rawProgress.currentStage || 1;
    
    let processed: number;
    let total: number;
    
    if (currentStage === 2) {
      // 2단계: 제품 상세 수집 - processedItems/totalItems 사용
      processed = this.isCompleted 
        ? (this._rawProgress.totalItems || this._rawProgress.processedItems || 0)
        : (this._rawProgress.processedItems || 0);
      total = this._rawProgress.totalItems || 0;
    } else {
      // 1단계: 페이지 수집 - currentPage/totalPages 사용
      processed = this.isCompleted 
        ? (this._rawProgress.totalPages || this._rawProgress.currentPage || 0)
        : (this._rawProgress.currentPage || 0);
      total = this._rawProgress.totalPages || 0;
    }
    
    return {
      processed,
      total,
      displayText: `${processed}/${total}`
    };
  }

  // === 시간 관련 Computed Properties ===
  get remainingTimeDisplay(): string {
    // 완료 상태이면 즉시 '0초' 반환
    if (this.isCompleted) return '0초';
    if (this.isIdle) return '--';
    
    const remaining = this._rawProgress.remainingTime || 0;
    
    // 진행률이 100%에 가깝거나 잘못된 시간이면 '0초'로 표시
    if (remaining <= 0 || this._rawProgress.percentage >= 99.9) {
      return '0초';
    }
    
    return this.formatDuration(remaining);
  }

  get elapsedTimeDisplay(): string {
    const elapsed = this._rawProgress.elapsedTime || 0;
    return this.formatDuration(elapsed);
  }

  // === 상태 감지 Computed Properties ===
  get isCompleted(): boolean {
    // 더 정확한 완료 상태 감지 로직
    const status = this._rawProgress.status;
    const stage = this._rawProgress.stage;
    const percentage = this._rawProgress.percentage || 0;
    const currentStep = this._rawProgress.currentStep || '';
    
    // 1. 명시적 완료 상태 확인 (올바른 CrawlingStage 타입 사용)
    if (status === 'completed' || stage === 'complete') {
      return true;
    }
    
    // 2. 진행률이 100%이고 오류 상태가 아닌 경우
    if (percentage >= 100 && status !== 'error' && stage !== 'error') {
      return true;
    }
    
    // 3. currentStep에 '완료' 키워드가 포함되고 오류가 아닌 경우
    if (currentStep.includes('완료') && !currentStep.includes('오류') && !currentStep.includes('실패')) {
      return true;
    }
    
    return false;
  }

  get isIdle(): boolean {
    return this._rawProgress.status === 'idle' || 
           !this._rawProgress.status;
  }

  get isError(): boolean {
    const status = this._rawProgress.status;
    const stage = this._rawProgress.stage;
    const currentStep = this._rawProgress.currentStep || '';
    
    // 명시적 오류 상태 확인 (올바른 CrawlingStage 타입 사용)
    return status === 'error' || 
           stage === 'error' ||
           currentStep.includes('오류') ||
           currentStep.includes('실패');
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
