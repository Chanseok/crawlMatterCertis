/**
 * CrawlingWorkflowViewModel.ts
 * 크롤링 워크플로우 전체 관리를 위한 ViewModel
 * 
 * 책임:
 * - 1단계(제품 목록) → DB 비교 → 2단계(상세 정보) 워크플로우 관리
 * - 각 단계별 진행률 및 상태 관리
 * - 에러 처리 및 사용자 알림
 * - 크롤링 중단/재시작 기능
 */

import { BaseViewModel } from './core/BaseViewModel';
import { makeObservable, observable, action, computed } from 'mobx';
import { crawlingStore } from '../stores/domain/CrawlingStore';
import { databaseStore } from '../stores/domain/DatabaseStore';
import { logStore } from '../stores/domain/LogStore';
import { ProgressUtils } from '../../shared/utils';

/**
 * 크롤링 워크플로우 단계 정의
 */
export enum WorkflowStage {
  IDLE = 'idle',
  CHECKING_STATUS = 'checking-status',
  STAGE1_PRODUCT_LIST = 'stage1-product-list',
  DB_COMPARISON = 'db-comparison',
  STAGE2_PRODUCT_DETAILS = 'stage2-product-details',
  COMPLETED = 'completed',
  ERROR = 'error',
  CANCELLED = 'cancelled'
}

/**
 * 워크플로우 상태 인터페이스
 */
export interface WorkflowState {
  currentStage: WorkflowStage;
  overallProgress: number;
  stage1Progress: number;
  stage2Progress: number;
  dbComparisonProgress: number;
  error: string | null;
  canStart: boolean;
  canStop: boolean;
  canPause: boolean;
  estimatedTimeRemaining: number | null;
  
  // Additional properties needed by UI components
  isRunning: boolean;
  stage: WorkflowStage;
  productCount: number;
}

/**
 * 크롤링 워크플로우 ViewModel
 * MobX 기반 상태 관리와 Clean Architecture 패턴을 결합
 */
export class CrawlingWorkflowViewModel extends BaseViewModel {
  // === Observable State ===
  @observable accessor currentStage: WorkflowStage = WorkflowStage.IDLE;
  @observable accessor overallProgress: number = 0;
  @observable accessor stage1Progress: number = 0;
  @observable accessor stage2Progress: number = 0;
  @observable accessor dbComparisonProgress: number = 0;
  @observable accessor error: string | null = null;
  @observable accessor estimatedTimeRemaining: number | null = null;
  @observable accessor isInitialized: boolean = false;

  // === Domain Store References ===
  private crawlingStore = crawlingStore;
  private databaseStore = databaseStore;
  private logStore = logStore;

  constructor() {
    super();
    makeObservable(this);
    this.initialize();
  }

  // === Computed Properties ===
  @computed get workflowState(): WorkflowState {
    return {
      currentStage: this.currentStage,
      overallProgress: this.overallProgress,
      stage1Progress: this.stage1Progress,
      stage2Progress: this.stage2Progress,
      dbComparisonProgress: this.dbComparisonProgress,
      error: this.error,
      canStart: this.canStart,
      canStop: this.canStop,
      canPause: this.canPause,
      estimatedTimeRemaining: this.estimatedTimeRemaining,
      // Additional properties needed by UI components
      isRunning: this.crawlingStore.isRunning,
      stage: this.currentStage,
      productCount: this.crawlingStore.progress.totalItems || 0
    };
  }

  @computed get canStart(): boolean {
    return this.currentStage === WorkflowStage.IDLE && !this.crawlingStore.isRunning;
  }

  @computed get canStop(): boolean {
    return this.currentStage !== WorkflowStage.IDLE && 
           this.currentStage !== WorkflowStage.COMPLETED && 
           this.currentStage !== WorkflowStage.ERROR;
  }

  @computed get canPause(): boolean {
    return this.currentStage === WorkflowStage.STAGE1_PRODUCT_LIST || 
           this.currentStage === WorkflowStage.STAGE2_PRODUCT_DETAILS;
  }

  @computed get isActive(): boolean {
    return this.currentStage !== WorkflowStage.IDLE && 
           this.currentStage !== WorkflowStage.COMPLETED && 
           this.currentStage !== WorkflowStage.ERROR && 
           this.currentStage !== WorkflowStage.CANCELLED;
  }

  // === Initialization ===
  @action
  async initialize(): Promise<void> {
    try {
      // Domain Store 상태 동기화
      this.syncWithDomainStores();
      
      // 크롤링 진행 상태 확인
      await this.checkCurrentStatus();
      
      this.isInitialized = true;
      this.logDebug('initialize', 'CrawlingWorkflowViewModel initialized successfully');
    } catch (error) {
      this.error = `Initialization failed: ${error}`;
      this.logError('initialize', error);
    }
  }

  // === Public Methods ===
  /**
   * App 등에서 호출하는 외부용 워크플로우 상태 체크 메서드
   */
  async checkWorkflowStatus(): Promise<void> {
    await this.checkCurrentStatus();
  }

  /**
   * Check current crawling status and sync with stores
   */
  @action
  private async checkCurrentStatus(): Promise<void> {
    try {
      this.logDebug('checkCurrentStatus', 'Checking current crawling status');
      
      // Sync with crawling store
      this.syncWithDomainStores();
      
      // Check if there's an active crawling session
      if (this.crawlingStore.isRunning) {
        this.currentStage = this.determineStageFromCrawlingStore();
        this.logDebug('checkCurrentStatus', `Found active crawling session at stage: ${this.currentStage}`);
      } else {
        this.currentStage = WorkflowStage.IDLE;
        this.logDebug('checkCurrentStatus', 'No active crawling session found');
      }
      // 진행률 동기화
      this.syncWithDomainStores();
      
    } catch (error) {
      this.logError('checkCurrentStatus', error);
      this.error = `Failed to check current status: ${error}`;
    }
  }

  // === Domain Store Synchronization ===
  @action
  private syncWithDomainStores(): void {
    // CrawlingStore 상태 반영
    if (this.crawlingStore.isRunning) {
      this.currentStage = this.determineStageFromCrawlingStore();
    }
    // 진행률 동기화
    // stage1: currentStage==1, stage2: currentStage==2
    const progress = this.crawlingStore.progress;
    this.stage1Progress = progress.currentStage === 1 ? progress.percentage : 0;
    this.stage2Progress = progress.currentStage === 2 ? progress.percentage : 0;
    this.calculateOverallProgress();
  }

  @action
  private determineStageFromCrawlingStore(): WorkflowStage {
    const status = this.crawlingStore.status;
    
    if (status?.includes('stage1') || status?.includes('product-list')) {
      return WorkflowStage.STAGE1_PRODUCT_LIST;
    } else if (status?.includes('stage2') || status?.includes('product-detail')) {
      return WorkflowStage.STAGE2_PRODUCT_DETAILS;
    } else if (status?.includes('comparison') || status?.includes('db-check')) {
      return WorkflowStage.DB_COMPARISON;
    }
    
    return WorkflowStage.IDLE;
  }

  // === Workflow Actions ===
  
  /**
   * 전체 크롤링 워크플로우 시작
   */
  @action
  async startWorkflow(): Promise<void> {
    if (!this.canStart) {
      throw new Error('Cannot start workflow in current state');
    }
    try {
      this.clearError();
      this.currentStage = WorkflowStage.CHECKING_STATUS;
      // 1단계: 상태 확인
      await this.executeStatusCheck();
      // 2단계: 1단계 크롤링 시작
      await this.executeStage1();
    } catch (error) {
      this.handleWorkflowError(error);
    }
  }

  /**
   * 크롤링 워크플로우 중단
   */
  @action
  async stopWorkflow(): Promise<void> {
    if (!this.canStop) {
      return;
    }

    try {
      await this.crawlingStore.stopCrawling();
      this.currentStage = WorkflowStage.CANCELLED;
      this.addLog('Crawling workflow cancelled by user', 'warning');
    } catch (error) {
      this.handleWorkflowError(error);
    }
  }

  /**
   * 크롤링 워크플로우 일시정지
   */
  @action
  async pauseWorkflow(): Promise<void> {
    if (!this.canPause) {
      return;
    }

    try {
      // 현재는 일시정지 기능이 없으므로 중단으로 처리
      await this.stopWorkflow();
    } catch (error) {
      this.handleWorkflowError(error);
    }
  }

  // === Workflow Stage Execution ===

  /**
   * 상태 확인 단계 실행
   */
  @action
  private async executeStatusCheck(): Promise<void> {
    this.currentStage = WorkflowStage.CHECKING_STATUS;
    this.addLog('Checking crawling status...', 'info');

    try {
      await this.crawlingStore.checkStatus();
      this.addLog('Status check completed', 'success');
    } catch (error) {
      throw new Error(`Status check failed: ${error}`);
    }
  }

  /**
   * 1단계 크롤링 실행
   */
  @action
  private async executeStage1(): Promise<void> {
    this.currentStage = WorkflowStage.STAGE1_PRODUCT_LIST;
    this.addLog('Starting Stage 1: Product list crawling...', 'info');
    try {
      // CrawlingStore를 통해 크롤링 시작
      await this.crawlingStore.startCrawling();
      // 진행률 모니터링 시작
      this.startProgressMonitoring();
    } catch (error) {
      throw new Error(`Stage 1 failed: ${error}`);
    }
  }

  /**
   * DB 비교 단계 실행
   */
  @action
  private async executeDbComparison(): Promise<void> {
    this.currentStage = WorkflowStage.DB_COMPARISON;
    this.dbComparisonProgress = 0;
    this.addLog('Starting DB comparison...', 'info');

    try {
      // 데이터베이스 요약 정보 로드
      await this.databaseStore.loadSummary();
      this.dbComparisonProgress = 50;

      // 비교 로직 실행 (현재는 간단한 시뮬레이션)
      await this.simulateDbComparison();
      this.dbComparisonProgress = 100;

      this.addLog('DB comparison completed', 'success');
      
      // 2단계로 진행
      await this.executeStage2();
      
    } catch (error) {
      throw new Error(`DB comparison failed: ${error}`);
    }
  }

  /**
   * 2단계 크롤링 실행
   */
  @action
  private async executeStage2(): Promise<void> {
    this.currentStage = WorkflowStage.STAGE2_PRODUCT_DETAILS;
    this.addLog('Starting Stage 2: Product details crawling...', 'info');

    try {
      // 2단계 크롤링 로직 (현재는 자동으로 진행됨)
      // 실제 구현에서는 별도 호출이 필요할 수 있음
      
    } catch (error) {
      throw new Error(`Stage 2 failed: ${error}`);
    }
  }

  // === Progress Monitoring ===

  @action
  private startProgressMonitoring(): void {
    // CrawlingStore의 진행률 변화를 모니터링
    const progressInterval = setInterval(() => {
      this.updateProgress();
      // 완료 조건 확인
      if (this.crawlingStore.status === 'completed') {
        clearInterval(progressInterval);
        this.handleWorkflowCompletion();
      } else if (this.crawlingStore.status === 'completed_stage_1') {
        clearInterval(progressInterval);
        this.executeDbComparison();
      }
    }, 1000);
  }

  @action
  private updateProgress(): void {
    // Domain Store에서 진행률 동기화
    const progress = this.crawlingStore.progress;
    this.stage1Progress = progress.currentStage === 1 ? progress.percentage : 0;
    this.stage2Progress = progress.currentStage === 2 ? progress.percentage : 0;
    this.calculateOverallProgress();
    this.updateEstimatedTime();
  }

  @action
  private calculateOverallProgress(): void {
    const weights = [5, 40, 10, 45]; // statusCheck, stage1, dbComparison, stage2
    
    // Use ProgressUtils for standardized weighted progress calculation
    const stageProgresses = [
      this.currentStage !== WorkflowStage.IDLE ? 100 : 0, // statusCheck
      this.stage1Progress,
      this.dbComparisonProgress,
      this.stage2Progress
    ];

    this.overallProgress = ProgressUtils.calculateWeightedProgress(stageProgresses, weights);
  }

  @action
  private updateEstimatedTime(): void {
    // 현재 진행률을 기반으로 남은 시간 추정
    if (this.overallProgress > 0 && this.overallProgress < 100) {
      const elapsedTime = Date.now() - (this.crawlingStore.progress.startTime || Date.now());
      const estimatedTotal = (elapsedTime / this.overallProgress) * 100;
      this.estimatedTimeRemaining = estimatedTotal - elapsedTime;
    } else {
      this.estimatedTimeRemaining = null;
    }
  }

  // === Event Handlers ===

  @action
  private handleWorkflowCompletion(): void {
    this.currentStage = WorkflowStage.COMPLETED;
    this.overallProgress = 100;
    this.estimatedTimeRemaining = null;
    this.addLog('Crawling workflow completed successfully!', 'success');
  }

  @action
  private handleWorkflowError(error: any): void {
    this.currentStage = WorkflowStage.ERROR;
    this.error = error instanceof Error ? error.message : String(error);
    this.addLog(`Workflow error: ${this.error}`, 'error');
    this.logError('handleWorkflowError', error);
  }

  @action
  clearError(): void {
    this.error = null;
  }

  // === Utility Methods ===

  @action
  private async simulateDbComparison(): Promise<void> {
    // DB 비교 시뮬레이션 (실제 구현 시 교체)
    return new Promise(resolve => {
      setTimeout(resolve, 2000);
    });
  }

  private addLog(message: string, type: 'info' | 'success' | 'warning' | 'error'): void {
    this.logStore.addLog(message, type);
  }

  // === Public State Access ===
  
  /**
   * 현재 워크플로우 상태 반환
   */
  getWorkflowState(): WorkflowState {
    return this.workflowState;
  }

  /**
   * 단계별 진행 상황 상세 정보
   */
  getProgressDetails() {
    return {
      currentStage: this.currentStage,
      overallProgress: this.overallProgress,
      stageProgress: {
        stage1: this.stage1Progress,
        stage2: this.stage2Progress,
        dbComparison: this.dbComparisonProgress
      },
      timing: {
        estimatedTimeRemaining: this.estimatedTimeRemaining,
        startTime: this.crawlingStore.progress.startTime
      },
      status: {
        canStart: this.canStart,
        canStop: this.canStop,
        canPause: this.canPause,
        isActive: this.isActive
      }
    };
  }

  /**
   * 리소스 정리
   */
  cleanup(): void {
    // 필요한 경우 리소스 정리
    this.logDebug('cleanup', 'CrawlingWorkflowViewModel cleanup completed');
  }
}
