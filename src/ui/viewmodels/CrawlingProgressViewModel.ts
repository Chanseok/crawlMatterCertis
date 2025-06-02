/**
 * CrawlingProgressViewModel.ts
 * 크롤링 진행 상태 관리를 위한 전용 ViewModel
 * 
 * - 최고 단계 추적으로 UI 퇴행 방지
 * - MobX reactions으로 자동 상태 동기화
 * - 진행 상황 업데이트 처리 로직 캡슐화
 */

import { makeObservable, observable, computed, action, reaction } from 'mobx';
import type { CrawlingProgress, CrawlingStageId } from '../../../types';

// 단계별 가중치 (UI 표시용)
const STAGE_WEIGHTS: Record<CrawlingStageId, number> = {
  'ready': 0,
  'initialization': 10,
  'category-extraction': 20,
  'product-search': 40,
  'product-detail': 70,
  'completion': 100
};

// 단계별 순서 (최고 단계 추적용)
const STAGE_ORDER: Record<CrawlingStageId, number> = {
  'ready': 0,
  'initialization': 1,
  'category-extraction': 2,
  'product-search': 3,
  'product-detail': 4,
  'completion': 5
};

/**
 * 크롤링 진행 상태 전용 ViewModel
 */
export class CrawlingProgressViewModel {
  @observable accessor currentProgress: CrawlingProgress | null = null;
  @observable accessor highestStageReached: CrawlingStageId = 'ready';
  @observable accessor isRegressing = false; // UI 퇴행 상태 표시
  @observable accessor lastProgressUpdate: number = 0; // 마지막 업데이트 시간

  private disposeReaction?: () => void;

  constructor() {
    makeObservable(this);
    this.setupReactions();
  }

  /**
   * MobX reactions 설정
   */
  private setupReactions(): void {
    // 진행 상황이 업데이트될 때마다 최고 단계 추적
    this.disposeReaction = reaction(
      () => this.currentProgress?.currentStage,
      (currentStage) => {
        if (currentStage) {
          this.updateHighestStage(currentStage);
        }
      }
    );
  }

  /**
   * 현재 진행률 (가중치 기반)
   */
  @computed get progressPercentage(): number {
    if (!this.currentProgress) return 0;
    
    const stageWeight = STAGE_WEIGHTS[this.currentProgress.currentStage] || 0;
    const stageProgress = this.currentProgress.progress || 0;
    
    // 단계 내 진행률을 고려하여 더 정확한 퍼센티지 계산
    return Math.min(100, stageWeight + (stageProgress * 0.1));
  }

  /**
   * 표시할 진행률 (퇴행 방지)
   */
  @computed get displayPercentage(): number {
    const currentPercentage = this.progressPercentage;
    const highestStageWeight = STAGE_WEIGHTS[this.highestStageReached] || 0;
    
    // 현재 진행률이 이전 최고 단계보다 낮으면 최고 단계 기준으로 표시
    return Math.max(currentPercentage, highestStageWeight);
  }

  /**
   * 표시할 단계 (퇴행 방지)
   */
  @computed get displayStage(): CrawlingStageId {
    if (!this.currentProgress) return this.highestStageReached;
    
    const currentStageOrder = STAGE_ORDER[this.currentProgress.currentStage] || 0;
    const highestStageOrder = STAGE_ORDER[this.highestStageReached] || 0;
    
    // 현재 단계가 최고 단계보다 낮으면 최고 단계 표시
    return currentStageOrder >= highestStageOrder 
      ? this.currentProgress.currentStage 
      : this.highestStageReached;
  }

  /**
   * 단계별 표시 텍스트
   */
  @computed get stageDisplayText(): string {
    switch (this.displayStage) {
      case 'ready': return '대기 중...';
      case 'initialization': return '초기화 중...';
      case 'category-extraction': return '카테고리 추출 중...';
      case 'product-search': return '상품 검색 중...';
      case 'product-detail': return '상품 상세 정보 수집 중...';
      case 'completion': return '완료';
      default: return '진행 중...';
    }
  }

  /**
   * 현재 진행률이 퇴행 중인지 확인
   */
  @computed get isProgressRegressing(): boolean {
    if (!this.currentProgress) return false;
    
    const currentStageOrder = STAGE_ORDER[this.currentProgress.currentStage] || 0;
    const highestStageOrder = STAGE_ORDER[this.highestStageReached] || 0;
    
    return currentStageOrder < highestStageOrder;
  }

  /**
   * 진행 상황 업데이트
   */
  @action
  updateProgress(progress: CrawlingProgress): void {
    this.currentProgress = progress;
    this.lastProgressUpdate = Date.now();
    
    if (progress.currentStage) {
      this.updateHighestStage(progress.currentStage);
    }
    
    console.log('[CrawlingProgressViewModel] Progress updated:', {
      stage: progress.currentStage,
      progress: progress.progress,
      displayStage: this.displayStage,
      displayPercentage: this.displayPercentage,
      isRegressing: this.isProgressRegressing
    });
  }

  /**
   * 최고 단계 업데이트
   */
  @action
  private updateHighestStage(stage: CrawlingStageId): void {
    const currentStageOrder = STAGE_ORDER[stage] || 0;
    const highestStageOrder = STAGE_ORDER[this.highestStageReached] || 0;
    
    if (currentStageOrder > highestStageOrder) {
      const previousHighest = this.highestStageReached;
      this.highestStageReached = stage;
      this.isRegressing = false;
      
      console.log('[CrawlingProgressViewModel] Highest stage updated:', {
        from: previousHighest,
        to: stage,
        order: currentStageOrder
      });
    } else if (currentStageOrder < highestStageOrder) {
      this.isRegressing = true;
      console.warn('[CrawlingProgressViewModel] Progress regression detected:', {
        currentStage: stage,
        highestStage: this.highestStageReached,
        currentOrder: currentStageOrder,
        highestOrder: highestStageOrder
      });
    }
  }

  /**
   * 진행 상태 초기화
   */
  @action
  reset(): void {
    this.currentProgress = null;
    this.highestStageReached = 'ready';
    this.isRegressing = false;
    this.lastProgressUpdate = 0;
    
    console.log('[CrawlingProgressViewModel] Progress state reset');
  }

  /**
   * 완료 상태로 설정
   */
  @action
  setCompleted(): void {
    this.highestStageReached = 'completion';
    this.isRegressing = false;
    
    if (this.currentProgress) {
      this.currentProgress = {
        ...this.currentProgress,
        currentStage: 'completion',
        progress: 100
      };
    }
    
    console.log('[CrawlingProgressViewModel] Set to completed state');
  }

  /**
   * ViewModel 정리
   */
  dispose(): void {
    if (this.disposeReaction) {
      this.disposeReaction();
    }
  }
}

// 싱글톤 인스턴스 생성
export const crawlingProgressViewModel = new CrawlingProgressViewModel();
