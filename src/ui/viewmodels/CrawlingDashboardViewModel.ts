/**
 * CrawlingDashboardViewModel.ts
 * ViewModel for CrawlingDashboard Component
 * 
 * Separates complex business logic from UI component, providing clean abstractions
 * and computed properties for dashboard display logic.
 */

import { makeObservable, observable, computed, action } from 'mobx';
import { crawlingStore } from '../stores/domain/CrawlingStore';
import { taskStore } from '../stores/domain/TaskStore';
import type { CrawlingProgress, CrawlingStatus, CrawlerConfig } from '../../../types';
import type { CrawlingStatusSummary } from '../stores/domain/CrawlingStore';

interface AnimatedValues {
  percentage: number;
  currentPage: number;
  processedItems: number;
  newItems: number;
  updatedItems: number;
  retryCount: number;
}

/**
 * ViewModel for CrawlingDashboard
 * Encapsulates all dashboard-specific logic and state transformations
 */
export class CrawlingDashboardViewModel {
  // Local UI state
  @observable accessor isSuccess = false;
  @observable accessor showCompletion = false;
  @observable accessor animatedValues: AnimatedValues = {
    percentage: 0,
    currentPage: 0,
    processedItems: 0,
    newItems: 0,
    updatedItems: 0,
    retryCount: 0
  };
  @observable accessor animatedDigits = {
    currentPage: false,
    processedItems: false,
    retryCount: false,
    newItems: false,
    updatedItems: false,
    elapsedTime: false,
    remainingTime: false
  };

  private animationRef: number | null = null;

  constructor() {
    makeObservable(this);
  }

  // Domain Store delegates
  get status(): CrawlingStatus {
    return crawlingStore.status;
  }

  get progress(): CrawlingProgress {
    return crawlingStore.progress;
  }

  get config(): CrawlerConfig {
    return crawlingStore.config;
  }

  get statusSummary() {
    return crawlingStore.statusSummary;
  }

  get lastStatusSummary() {
    return crawlingStore.lastStatusSummary;
  }

  get error() {
    return crawlingStore.error;
  }

  get isCheckingStatus() {
    return crawlingStore.isCheckingStatus;
  }

  get concurrentTasks() {
    return taskStore.concurrentTasks;
  }

  // Computed properties for UI logic
  @computed get targetPageCount(): number {
    // Complex page count calculation logic
    const statusActualTarget = this.statusSummary?.actualTargetPageCountForStage1;
    const progressTotalPages = this.progress.totalPages;
    const rangeBased = this.crawlingRange ? 
      (this.crawlingRange.startPage - this.crawlingRange.endPage + 1) : 
      null;
    const configLimit = this.config.pageRangeLimit;
    const siteTotalPages = this.statusSummary?.siteTotalPages;

    return statusActualTarget || 
           progressTotalPages || 
           rangeBased || 
           configLimit || 
           siteTotalPages || 
           1;
  }

  @computed get crawlingRange() {
    return this.statusSummary?.crawlingRange;
  }

  @computed get calculatedPercentage(): number {
    if (this.status !== 'running' || this.progress.currentStage !== 1) return 0;

    let successCount = 0;

    // 1. stage1PageStatuses에서 성공 상태인 페이지 수 확인
    if (this.progress.stage1PageStatuses && Array.isArray(this.progress.stage1PageStatuses)) {
      const successStatusPages = this.progress.stage1PageStatuses.filter(p => p.status === 'success').length;
      successCount = Math.max(successCount, successStatusPages);
    }

    // 2. currentPage 값 확인
    if (this.progress.currentPage !== undefined && this.progress.currentPage > 0) {
      successCount = Math.max(successCount, this.progress.currentPage);
    }

    // 3. concurrentTasks에서 성공 상태인 페이지 확인
    if (this.concurrentTasks && this.concurrentTasks.length > 0) {
      const successTasksCount = this.concurrentTasks.filter(task => task.status === 'success').length;
      successCount = Math.max(successTasksCount, successCount);
    }

    const actualTargetPageCount = 
      (this.progress.currentStage === 1 && this.statusSummary?.actualTargetPageCountForStage1) || 
      (this.statusSummary?.crawlingRange ? 
        (this.statusSummary.crawlingRange.startPage - this.statusSummary.crawlingRange.endPage + 1) : 
        this.targetPageCount);

    return actualTargetPageCount > 0 ? (successCount / actualTargetPageCount) * 100 : 0;
  }

  @computed get stageInfo(): { text: string; color: string } {
    const currentStep = this.progress.currentStep || '';
    
    // 1.5단계 검증 진행 상태 처리
    if (currentStep.includes('1.5/3단계') || currentStep.includes('로컬db') || 
        currentStep.includes('검증') || currentStep.includes('db 중복')) {
      return {
        text: '1.5단계: 제품 검증',
        color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300'
      };
    } else if (this.progress.currentStage === 1) {
      return {
        text: '1단계: 목록 수집',
        color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300'
      };
    } else if (this.progress.currentStage === 2) {
      return {
        text: '2단계: 상세 수집',
        color: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300'
      };
    } else if (this.status === 'completed' && !this.progress.currentStage) {
      return {
        text: '완료',
        color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
      };
    } else if (this.status === 'error') {
      return {
        text: '오류 발생',
        color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
      };
    }
    
    return {
      text: '대기',
      color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
    };
  }

  @computed get collectionStatusText(): string {
    const isBeforeStatusCheck = !this.statusSummary || Object.keys(this.statusSummary).length === 0;
    const isAfterStatusCheck = this.statusSummary && this.status === 'idle';

    if (this.status === 'running' && this.progress.currentStage === 1) {
      return '목록 수집 중';
    } else if (this.status === 'running' && this.progress.currentStage === 2) {
      return '상세 정보 수집 중';
    } else if (isBeforeStatusCheck) {
      return '목록 수집 상태';
    } else if (isAfterStatusCheck) {
      return '목록 수집 대기';
    } else {
      return '목록 수집 상태';
    }
  }

  @computed get retryStatusText(): string {
    const isBeforeStatusCheck = !this.statusSummary || Object.keys(this.statusSummary).length === 0;
    const isAfterStatusCheck = this.statusSummary && this.status === 'idle';

    if (isBeforeStatusCheck) {
      return '재시도 카운트';
    } else if (isAfterStatusCheck) {
      return `목록 수집 재시도 설정: ${this.config.productListRetryCount || 0}, 상세 수집 재시도 설정: ${this.config.productDetailRetryCount || 0}`;
    } else if (this.status === 'running') {
      const currentStage = this.progress.currentStage;
      const retryCount = Math.round(this.animatedValues.retryCount);
      const maxRetries = this.progress.maxRetries !== undefined ? this.progress.maxRetries :
        currentStage === 1 ? this.config.productListRetryCount :
        currentStage === 2 ? this.config.productDetailRetryCount : 0;
      
      return `재시도: ${retryCount}${maxRetries ? ` / ${maxRetries}` : '회'}`;
    }
    
    return '재시도 정보';
  }

  // Status change detection
  isValueChanged(key: keyof CrawlingStatusSummary): boolean {
    if (!this.statusSummary || !this.lastStatusSummary) return false;

    if (key === 'dbLastUpdated') {
      const current = this.statusSummary[key];
      const previous = this.lastStatusSummary[key];
      return current !== previous && 
             current !== null && previous !== null &&
             new Date(current).getTime() !== new Date(previous).getTime();
    }

    return this.statusSummary[key] !== this.lastStatusSummary[key];
  }

  // Animation methods
  @action setAnimatedValues(values: Partial<AnimatedValues>) {
    this.animatedValues = { ...this.animatedValues, ...values };
  }

  @action setAnimatedDigits(digits: Partial<typeof this.animatedDigits>) {
    this.animatedDigits = { ...this.animatedDigits, ...digits };
  }

  @action setShowCompletion(show: boolean) {
    this.showCompletion = show;
  }

  @action setIsSuccess(success: boolean) {
    this.isSuccess = success;
  }

  // Animation control
  startValueAnimation() {
    if (this.animationRef) {
      clearInterval(this.animationRef);
    }

    const targetValues = {
      percentage: this.progress.currentStage === 1 ? this.calculatedPercentage : (this.progress.percentage || 0),
      currentPage: this.getCurrentPageValue(),
      processedItems: this.progress.processedItems || 0,
      newItems: this.progress.newItems || 0,
      updatedItems: this.progress.updatedItems || 0,
      retryCount: this.progress.retryCount !== undefined ? this.progress.retryCount : 0
    };

    const startValues = { ...this.animatedValues };
    const steps = 8;
    let step = 0;

    this.animationRef = window.setInterval(() => {
      step++;
      if (step >= steps) {
        this.setAnimatedValues(targetValues);
        if (this.animationRef) {
          clearInterval(this.animationRef);
          this.animationRef = null;
        }
        return;
      }

      const progressEase = 1 - Math.pow(1 - step / steps, 2);

      const newValues = {
        percentage: startValues.percentage + (targetValues.percentage - startValues.percentage) * progressEase,
        currentPage: startValues.currentPage + (targetValues.currentPage - startValues.currentPage) * progressEase,
        processedItems: startValues.processedItems + Math.round((targetValues.processedItems - startValues.processedItems) * progressEase),
        newItems: startValues.newItems + Math.round((targetValues.newItems - startValues.newItems) * progressEase),
        updatedItems: startValues.updatedItems + Math.round((targetValues.updatedItems - startValues.updatedItems) * progressEase),
        retryCount: startValues.retryCount + Math.round((targetValues.retryCount - startValues.retryCount) * progressEase)
      };

      this.setAnimatedValues(newValues);
    }, 40);
  }

  private getCurrentPageValue(): number {
    if (this.status !== 'running' || this.progress.currentStage !== 1) {
      return this.progress.currentPage || 0;
    }

    let successPageCount = 0;

    // Multiple sources for current page calculation
    if (this.progress.stage1PageStatuses && Array.isArray(this.progress.stage1PageStatuses)) {
      const successStatusPages = this.progress.stage1PageStatuses.filter(p => p.status === 'success').length;
      successPageCount = Math.max(successPageCount, successStatusPages);
    }

    if (this.concurrentTasks && this.concurrentTasks.length > 0) {
      const successTasksCount = this.concurrentTasks.filter((task) => task.status === 'success').length;
      successPageCount = Math.max(successPageCount, successTasksCount);
    }

    if (this.progress.currentPage !== undefined && this.progress.currentPage > 0) {
      successPageCount = Math.max(successPageCount, this.progress.currentPage);
    }

    return successPageCount;
  }

  // Action delegates
  async startCrawling() {
    return crawlingStore.startCrawling();
  }

  async stopCrawling() {
    return crawlingStore.stopCrawling();
  }

  async checkStatus() {
    return crawlingStore.checkStatus();
  }

  updateProgress(progressUpdate: Partial<CrawlingProgress>) {
    return crawlingStore.updateProgress(progressUpdate);
  }

  clearError() {
    return crawlingStore.clearError();
  }

  // Cleanup
  cleanup() {
    if (this.animationRef) {
      clearInterval(this.animationRef);
      this.animationRef = null;
    }
  }
}
