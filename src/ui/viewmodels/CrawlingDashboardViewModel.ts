/**
 * CrawlingDashboardViewModel.ts
 * ViewModel for CrawlingDashboard Component
 * 
 * Separates complex business logic from UI component, providing clean abstractions
 * and computed properties for dashboard display logic.
 */

import { makeObservable, observable, action } from 'mobx';
import { crawlingStore } from '../stores/domain/CrawlingStore';
import { taskStore } from '../stores/domain/TaskStore';
import type {
  CrawlingProgress,
  CrawlingStatus,
  CrawlerConfig,
  CrawlingStatusSummary,
} from '../../../types'; // Corrected import path

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
    makeObservable(this, {
      // Only actions and observable properties - no computed to avoid cycles
      setAnimatedValues: action,
      setAnimatedDigits: action,
      setShowCompletion: action,
      setIsSuccess: action
    });
  }

  // Primary reactive properties that UI components should use (NOT computed to avoid cycles)
  get currentStage(): 1 | 2 | 3 | 0 {
    const stageValue = crawlingStore.progress.currentStage || 0;
    const currentStep = crawlingStore.progress.currentStep || '';
    
    // Convert string stage to number if needed
    const numericStage = typeof stageValue === 'number' ? stageValue : 0;
    
    // Stage 2 (validation) detection - return as 2 for proper UI handling
    if (numericStage === 2 || currentStep.includes('2/4단계') || 
        currentStep.includes('2단계') || currentStep.includes('검증') || 
        currentStep.includes('DB 중복 검증')) {
      return 2;
    }
    
    // Stage 3 (detail) detection
    if (numericStage === 3 || currentStep.includes('3단계') || 
        currentStep.includes('상세') || currentStep.includes('제품 상세')) {
      return 3;
    }
    
    // Stage 1 (list) detection
    if (numericStage === 1 || currentStep.includes('1단계') || 
        currentStep.includes('목록')) {
      return 1;
    }
    
    return 0; // Default/idle state
  }

  get currentStep(): string {
    return crawlingStore.progress.currentStep || '대기 중...';
  }

  // Domain Store delegates - simple getters without computed decorators
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

  // Regular method for UI logic
  get targetPageCount(): number {
    // Directly access store values to avoid circular dependencies
    const statusSummary = crawlingStore.statusSummary;
    const progress = crawlingStore.progress;
    const config = crawlingStore.config;
    
    // Complex page count calculation logic
    const statusActualTarget = statusSummary?.actualTargetPageCountForStage1;
    const progressTotalPages = progress.totalPages;
    
    // Inline crawlingRange calculation to avoid circular dependency
    const crawlingRange = statusSummary?.crawlingRange;
    const rangeBased = crawlingRange ? 
      (crawlingRange.startPage - crawlingRange.endPage + 1) : 
      null;
    
    const configLimit = config.pageRangeLimit;
    const siteTotalPages = statusSummary?.siteTotalPages;

    return statusActualTarget || 
           progressTotalPages || 
           rangeBased || 
           configLimit || 
           siteTotalPages || 
           1;
  }

  get calculatedPercentage(): number {
    // Directly access store values to avoid circular dependencies
    const status = crawlingStore.status;
    const progress = crawlingStore.progress;
    const currentStage = progress.currentStage || 0;
    
    if (status !== 'running' || currentStage !== 1) return 0;

    let successCount = 0;

    // 1. stage1PageStatuses에서 성공 상태인 페이지 수 확인
    if (progress.stage1PageStatuses && Array.isArray(progress.stage1PageStatuses)) {
      const successStatusPages = progress.stage1PageStatuses.filter(p => p.status === 'success').length;
      successCount = Math.max(successCount, successStatusPages);
    }

    // 2. currentPage 값 확인
    if (progress.currentPage !== undefined && progress.currentPage > 0) {
      successCount = Math.max(successCount, progress.currentPage);
    }

    // 3. concurrentTasks에서 성공 상태인 페이지 확인
    const concurrentTasks = taskStore.concurrentTasks;
    if (concurrentTasks && concurrentTasks.length > 0) {
      const successTasksCount = concurrentTasks.filter(task => task.status === 'success').length;
      successCount = Math.max(successTasksCount, successCount);
    }

    // Calculate target page count directly to avoid cycle with this.targetPageCount
    const statusSummary = crawlingStore.statusSummary;
    const config = crawlingStore.config;
    const actualTargetPageCount = 
      (currentStage === 1 && statusSummary?.actualTargetPageCountForStage1) || 
      (statusSummary?.crawlingRange ? 
        (statusSummary.crawlingRange.startPage - statusSummary.crawlingRange.endPage + 1) : 
        progress.totalPages || 
        config.pageRangeLimit || 
        statusSummary?.siteTotalPages || 
        1);

    return actualTargetPageCount > 0 ? (successCount / actualTargetPageCount) * 100 : 0;
  }

  get stageInfo(): { text: string; color: string } {
    // Directly access store values to avoid circular dependencies
    const currentStage = crawlingStore.progress.currentStage || 0;
    const currentStep = crawlingStore.progress.currentStep || '';
    
    // 1. Stage 2 (validation) 우선 체크
    if (currentStage === 2 || currentStep.includes('2/4단계') || 
        currentStep.includes('2단계') || currentStep.includes('로컬db') || 
        currentStep.includes('검증') || currentStep.includes('db 중복') ||
        currentStep.includes('DB 중복 검증')) {
      return {
        text: '2단계: 제품 검증',
        color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300'
      };
    }
    
    // 2. Stage 3 체크 - currentStage 우선
    if (currentStage === 3) {
      return {
        text: '3단계: 상세 수집',
        color: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300'
      };
    }
    
    // 3. currentStep을 통한 3단계 감지
    if (currentStep.includes('3단계') || currentStep.includes('상세') || currentStep.includes('제품 상세')) {
      return {
        text: '3단계: 상세 수집',
        color: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300'
      };
    }
    
    // 4. Stage 1 처리
    if (currentStage === 1 || currentStep.includes('1단계') || currentStep.includes('목록')) {
      return {
        text: '1단계: 목록 수집',
        color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300'
      };
    } 
    
    // 5. 완료 상태
    if (crawlingStore.status === 'completed' && !currentStage) {
      return {
        text: '완료',
        color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
      };
    } 
    
    // 6. 오류 상태
    if (crawlingStore.status === 'error') {
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

  get collectionStatusText(): string {
    // Directly access store values to avoid circular dependencies
    const statusSummary = crawlingStore.statusSummary;
    const status = crawlingStore.status;
    const progress = crawlingStore.progress;
    const currentStage = progress.currentStage || 0;
    
    const isBeforeStatusCheck = !statusSummary || Object.keys(statusSummary).length === 0;
    const isAfterStatusCheck = statusSummary && status === 'idle';

    if (status === 'running' && currentStage === 1) {
      return '목록 수집 중';
    } else if (status === 'running' && currentStage === 2) {
      return '상세 정보 수집 중';
    } else if (isBeforeStatusCheck) {
      return '목록 수집 상태';
    } else if (isAfterStatusCheck) {
      return '목록 수집 대기';
    } else {
      return '목록 수집 상태';
    }
  }

  get retryStatusText(): string {
    // Directly access store values to avoid circular dependencies
    const statusSummary = crawlingStore.statusSummary;
    const status = crawlingStore.status;
    const progress = crawlingStore.progress;
    const config = crawlingStore.config;
    const currentStage = progress.currentStage || 0;
    
    const isBeforeStatusCheck = !statusSummary || Object.keys(statusSummary).length === 0;
    const isAfterStatusCheck = statusSummary && status === 'idle';

    if (isBeforeStatusCheck) {
      return '재시도 카운트';
    } else if (isAfterStatusCheck) {
      return `목록 수집 재시도 설정: ${config.productListRetryCount || 0}, 상세 수집 재시도 설정: ${config.productDetailRetryCount || 0}`;
    } else if (status === 'running') {
      const retryCount = Math.round(this.animatedValues.retryCount);
      const maxRetries = progress.maxRetries !== undefined ? progress.maxRetries :
        currentStage === 1 ? config.productListRetryCount :
        currentStage === 2 ? config.productDetailRetryCount : 0;
      
      return `재시도: ${retryCount}${maxRetries ? ` / ${maxRetries}` : '회'}`;
    }
    
    return '재시도 정보';
  }

  // Status change detection
  isValueChanged(key: keyof CrawlingStatusSummary): boolean {
    // Directly access store values to avoid circular dependencies
    const statusSummary = crawlingStore.statusSummary;
    const lastStatusSummary = crawlingStore.lastStatusSummary;
    
    if (!statusSummary || !lastStatusSummary) return false;

    if (key === 'dbLastUpdated') {
      const current = statusSummary[key];
      const previous = lastStatusSummary[key];
      return current !== previous && 
             current !== null && previous !== null &&
             new Date(current).getTime() !== new Date(previous).getTime();
    }

    return statusSummary[key] !== lastStatusSummary[key];
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

    // Directly access store values to avoid circular dependencies
    const progress = crawlingStore.progress;
    const currentStage = progress.currentStage || 0;

    const targetValues = {
      percentage: currentStage === 1 ? this.calculatedPercentage : (progress.percentage || 0),
      currentPage: this.getCurrentPageValue(),
      processedItems: progress.processedItems || 0,
      newItems: progress.newItems || 0,
      updatedItems: progress.updatedItems || 0,
      retryCount: progress.retryCount !== undefined ? progress.retryCount : 0
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
    // Directly access store values to avoid circular dependencies
    const status = crawlingStore.status;
    const progress = crawlingStore.progress;
    const concurrentTasks = taskStore.concurrentTasks;
    const currentStage = progress.currentStage || 0;
    
    if (status !== 'running' || currentStage !== 1) {
      return progress.currentPage || 0;
    }

    let successPageCount = 0;

    // Multiple sources for current page calculation
    if (progress.stage1PageStatuses && Array.isArray(progress.stage1PageStatuses)) {
      const successStatusPages = progress.stage1PageStatuses.filter(p => p.status === 'success').length;
      successPageCount = Math.max(successPageCount, successStatusPages);
    }

    if (concurrentTasks && concurrentTasks.length > 0) {
      const successTasksCount = concurrentTasks.filter((task) => task.status === 'success').length;
      successPageCount = Math.max(successPageCount, successTasksCount);
    }

    if (progress.currentPage !== undefined && progress.currentPage > 0) {
      successPageCount = Math.max(successPageCount, progress.currentPage);
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
