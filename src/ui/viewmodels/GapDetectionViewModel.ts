/**
 * GapDetectionViewModel.ts
 * Gap Detection & Collection 기능을 위한 ViewModel
 * 
 * Clean Architecture 원칙:
 * - Single Responsibility: Gap Detection/Collection 전용 상태 관리
 * - Dependency Inversion: 인터페이스를 통한 서비스 의존성
 * - Open/Closed: 확장 가능한 Gap 처리 로직
 * - Interface Segregation: 명확한 역할 분리
 * 
 * 책임:
 * - Gap Detection 워크플로우 상태 관리
 * - Gap Collection 프로세스 제어
 * - 진행률 및 결과 추적
 * - 사용자 입력 유효성 검증
 * - 오류 처리 및 알림
 */

import { BaseViewModel } from './core/BaseViewModel';
import { makeObservable, observable, action, runInAction } from 'mobx';
import { logStore } from '../stores/domain/LogStore';
import { ServiceFactory } from '../services/ServiceFactory';
import { CrawlingService } from '../services/domain/CrawlingService';
import type { CrawlerConfig } from '../../../types';

/**
 * Gap Detection 작업 상태
 */
export enum GapDetectionStage {
  IDLE = 'idle',
  DETECTING = 'detecting',
  ANALYSIS = 'analysis',
  COLLECTING = 'collecting',
  COMPLETED = 'completed',
  ERROR = 'error'
}

/**
 * Gap Detection 옵션 인터페이스
 */
export interface GapDetectionOptions {
  detectOnly: boolean;
  maxConcurrentPages: number;
  maxRetries: number;
  delayBetweenPages: number;
  customPageRange?: {
    startPage: number;
    endPage: number;
  };
}

/**
 * Gap Collection 옵션 인터페이스 
 */
export interface GapCollectionOptions extends GapDetectionOptions {
  autoCollect: boolean;
  enableRetry: boolean;
  notificationEnabled: boolean;
  useExtendedCollection: boolean; // 주변 페이지 포함 수집 옵션
}

/**
 * Gap Detection 결과 정보 (갭 탐지 엔진과 호환)
 */
export interface GapDetectionResult {
  totalMissingProducts: number;
  missingPages: ReadonlyArray<{
    pageId: number;
    missingIndices: ReadonlyArray<number>;
    expectedCount: number;
    actualCount: number;
    completenessRatio: number;
  }>;
  completelyMissingPageIds: ReadonlyArray<number>;
  partiallyMissingPageIds: ReadonlyArray<number>;
  summary: {
    totalExpectedProducts: number;
    totalActualProducts: number;
    completionPercentage: number;
  };
  // 새로 추가: 크롤링 범위 정보
  crawlingRanges: ReadonlyArray<{
    startPage: number;
    endPage: number;
    missingPageIds: ReadonlyArray<number>;
    reason: string;
    priority: number;
    estimatedProducts: number;
  }>;
  totalSitePages: number;
  batchInfo: {
    totalBatches: number;
    estimatedTime: number;
    recommendedConcurrency: number;
  };
}

/**
 * Gap Collection 진행 상태
 */
export interface GapCollectionProgress {
  stage: GapDetectionStage;
  currentPage: number;
  totalPages: number;
  collectedPages: number;
  failedPages: number[];
  estimatedTimeRemaining: number;
  processingRate: number; // pages per minute
  errors: Array<{
    page: number;
    error: string;
    timestamp: Date;
  }>;
  // 배치 처리 관련 추가 정보
  currentBatch: number;
  totalBatches: number;
  batchProgress: number; // 현재 배치 내 진행률 (0-100)
  collectedProducts: number;
  totalMissingProducts: number;
}

/**
 * Gap Detection & Collection ViewModel
 * 
 * 아키텍처 패턴:
 * - Domain Logic: Gap detection/collection 비즈니스 로직
 * - State Management: MobX를 통한 반응형 상태 관리
 * - Error Boundary: 포괄적인 오류 처리
 * - Progress Tracking: 실시간 진행률 추적
 */
export class GapDetectionViewModel extends BaseViewModel {
  // === Observable State ===
  @observable accessor stage: GapDetectionStage = GapDetectionStage.IDLE;
  @observable.ref accessor options: GapCollectionOptions = this.getDefaultOptions();
  @observable.ref accessor progress: GapCollectionProgress = this.getDefaultProgress();
  @observable.ref accessor result: GapDetectionResult | null = null;
  @observable accessor error: string | null = null;
  @observable accessor lastOperation: string | null = null;

  // === Service Dependencies ===
  private logStore = logStore;
  private gapDetectionService = ServiceFactory.getInstance().getGapDetectionService();

  constructor() {
    super();
    makeObservable(this, {
      // Actions only - no computed properties to avoid cycles
      setOptions: action,
      startDetection: action,
      startCollection: action,
      startDetectionAndCollection: action,
      startBatchCollection: action,
      cancelOperation: action,
      resetState: action,
      clearError: action,
      updateProgress: action,
      setResult: action,
      setError: action
    });
  }

  // === Computed Properties (as getter methods to avoid MobX cycles) ===

  /**
   * 현재 작업이 실행 중인지 확인
   */
  get isRunning(): boolean {
    return this.stage !== GapDetectionStage.IDLE && 
           this.stage !== GapDetectionStage.COMPLETED && 
           this.stage !== GapDetectionStage.ERROR;
  }

  /**
   * Gap Detection 시작 가능 여부
   */
  get canStartDetection(): boolean {
    return this.stage === GapDetectionStage.IDLE || 
           this.stage === GapDetectionStage.COMPLETED;
  }

  /**
   * Gap Collection 시작 가능 여부
   */
  get canStartCollection(): boolean {
    const isRunning = this.stage !== GapDetectionStage.IDLE && 
                     this.stage !== GapDetectionStage.COMPLETED && 
                     this.stage !== GapDetectionStage.ERROR;
    return this.hasValidResult && !isRunning;
  }

  /**
   * 작업 취소 가능 여부
   */
  get canCancel(): boolean {
    return this.stage !== GapDetectionStage.IDLE && 
           this.stage !== GapDetectionStage.COMPLETED && 
           this.stage !== GapDetectionStage.ERROR;
  }

  /**
   * 진행률 백분율
   */
  get progressPercentage(): number {
    if (this.progress.totalPages === 0) return 0;
    return Math.round((this.progress.collectedPages / this.progress.totalPages) * 100);
  }

  /**
   * 유효한 결과가 있는지 확인
   */
  get hasValidResult(): boolean {
    return this.result !== null && (this.result.completelyMissingPageIds.length > 0 || this.result.partiallyMissingPageIds.length > 0);
  }

  // === Action Methods ===

  /**
   * Gap Detection 옵션 설정
   */
  @action setOptions(options: Partial<GapCollectionOptions>): void {
    try {
      this.options = { ...this.options, ...options };
      this.logStore.addLog(
        `Gap detection options updated: ${JSON.stringify(options)}`,
        'info',
        'GAP_DETECTION'
      );
    } catch (error) {
      this.handleError('Failed to set options', error);
    }
  }

  /**
   * Gap Detection만 실행
   */
  @action async startDetection(): Promise<void> {
    if (!this.canStartDetection) {
      throw new Error('Cannot start detection in current stage');
    }

    try {
      this.stage = GapDetectionStage.DETECTING;
      this.error = null;
      this.lastOperation = 'Detection';
      
      this.logStore.addLog('Starting gap detection...', 'info', 'GAP_DETECTION');

      // IPC communication to backend Gap Detection service
      const detectionResult = await this.performGapDetection();
      
      runInAction(() => {
        this.result = detectionResult;
        this.stage = GapDetectionStage.COMPLETED;
        this.lastOperation = `Detection completed - ${detectionResult.missingPages.length} gaps found`;
      });

      this.logStore.addLog(
        `Gap detection completed: ${detectionResult.missingPages.length} missing pages found`,
        'info',
        'GAP_DETECTION'
      );

    } catch (error) {
      this.handleError('Gap detection failed', error);
    }
  }

  /**
   * Gap Collection만 실행 (이미 Detection 결과가 있는 경우)
   */
  @action async startCollection(): Promise<void> {
    if (!this.canStartCollection) {
      throw new Error('Cannot start collection - no valid detection result');
    }

    try {
      this.stage = GapDetectionStage.COLLECTING;
      this.error = null;
      this.lastOperation = 'Collection';
      
      this.resetProgress();
      const totalPagesToCollect = this.result!.completelyMissingPageIds.length + this.result!.partiallyMissingPageIds.length;
      this.progress.totalPages = totalPagesToCollect;

      this.logStore.addLog(
        `Starting gap collection for ${totalPagesToCollect} pages...`,
        'info',
        'GAP_DETECTION'
      );

      // IPC communication to backend Gap Collection service
      const pagesToCollect = [...this.result!.completelyMissingPageIds, ...this.result!.partiallyMissingPageIds];
      await this.performGapCollection(pagesToCollect);
      
      runInAction(() => {
        this.stage = GapDetectionStage.COMPLETED;
        this.lastOperation = `Collection completed - ${this.progress.collectedPages} pages collected`;
      });

      this.logStore.addLog('Gap collection completed successfully', 'info', 'GAP_DETECTION');

    } catch (error) {
      this.handleError('Gap collection failed', error);
    }
  }

  /**
   * Gap Detection + Collection 전체 워크플로우 실행
   */
  @action async startDetectionAndCollection(): Promise<void> {
    if (!this.canStartDetection) {
      throw new Error('Cannot start detection and collection in current stage');
    }

    try {
      // Phase 1: Detection
      await this.startDetection();
      
      if (this.stage === GapDetectionStage.COMPLETED && this.hasValidResult) {
        // Phase 2: Collection (if gaps found)
        await this.startCollection();
      }

    } catch (error) {
      this.handleError('Gap detection and collection workflow failed', error);
    }
  }

  /**
   * Gap Batch Collection 전체 워크플로우 실행
   * 3-batch 수집 시스템을 사용하여 효율적인 배치 처리 수행
   */
  @action async startBatchCollection(): Promise<void> {
    if (!this.canStartDetection) {
      throw new Error('Cannot start batch collection in current stage');
    }

    try {
      this.stage = GapDetectionStage.DETECTING;
      this.error = null;
      this.lastOperation = 'Batch Collection';
      this.resetProgress();
      
      this.logStore.addLog('Starting gap batch collection workflow...', 'info', 'GAP_DETECTION');

      // Gap Batch Collection 수행
      const batchResult = await this.performGapBatchCollection();
      
      runInAction(() => {
        // Detection 결과 설정
        if (batchResult.gapResult) {
          this.result = batchResult.gapResult;
        }
        
        // Collection 진행률 업데이트
        if (batchResult.collectionResult) {
          this.progress.collectedPages = batchResult.collectionResult.collected;
          this.progress.failedPages = batchResult.collectionResult.failedPages.slice();
          this.progress.totalPages = batchResult.collectionResult.attempted;
          this.progress.collectedProducts = batchResult.collectionResult.totalProductsCollected || 0;
          
          if (batchResult.collectionResult.errors.length > 0) {
            this.progress.errors = batchResult.collectionResult.errors.map((error: any) => ({
              page: 0,
              error: error,
              timestamp: new Date()
            }));
          }
        }
        
        this.stage = GapDetectionStage.COMPLETED;
        this.lastOperation = `Batch collection completed - ${this.progress.collectedPages} pages collected`;
      });

      this.logStore.addLog(
        `Gap batch collection completed: ${this.progress.collectedPages} pages collected, ${this.progress.failedPages.length} failed`,
        'info',
        'GAP_DETECTION'
      );

    } catch (error) {
      this.handleError('Gap batch collection workflow failed', error);
    }
  }

  /**
   * 현재 작업 취소
   */
  @action async cancelOperation(): Promise<void> {
    if (!this.canCancel) return;

    try {
      // IPC communication to request backend operation cancellation
      // This will signal the gap detection/collection service to stop
      await this.performOperationCancellation();
      
      runInAction(() => {
        this.stage = GapDetectionStage.IDLE;
        this.lastOperation = 'Operation cancelled by user';
      });

      this.logStore.addLog('Gap detection/collection cancelled', 'info', 'GAP_DETECTION');

    } catch (error) {
      this.handleError('Failed to cancel operation', error);
    }
  }

  /**
   * 상태 초기화
   */
  @action resetState(): void {
    this.stage = GapDetectionStage.IDLE;
    this.result = null;
    this.error = null;
    this.lastOperation = null;
    this.resetProgress();
    
    this.logStore.addLog('Gap detection state reset', 'info', 'GAP_DETECTION');
  }

  /**
   * 오류 메시지 클리어
   */
  @action clearError(): void {
    this.error = null;
  }

  /**
   * 진행률 업데이트
   */
  @action updateProgress(progress: Partial<GapCollectionProgress>): void {
    this.progress = { ...this.progress, ...progress };
  }

  /**
   * 결과 설정
   */
  @action setResult(result: GapDetectionResult): void {
    this.result = result;
  }

  /**
   * 오류 설정
   */
  @action setError(error: string): void {
    this.error = error;
    this.stage = GapDetectionStage.ERROR;
  }

  // === Private Helper Methods ===

  /**
   * 기본 옵션 반환
   */
  private getDefaultOptions(): GapCollectionOptions {
    return {
      detectOnly: false,
      maxConcurrentPages: 3,
      maxRetries: 3,
      delayBetweenPages: 1000,
      autoCollect: true,
      enableRetry: true,
      notificationEnabled: true,
      useExtendedCollection: false // 기본값: false (표준 수집)
    };
  }

  /**
   * 기본 진행률 상태 반환
   */
  private getDefaultProgress(): GapCollectionProgress {
    return {
      stage: GapDetectionStage.IDLE,
      currentPage: 0,
      totalPages: 0,
      collectedPages: 0,
      failedPages: [],
      estimatedTimeRemaining: 0,
      processingRate: 0,
      errors: [],
      // 배치 처리 관련 기본값
      currentBatch: 0,
      totalBatches: 0,
      batchProgress: 0,
      collectedProducts: 0,
      totalMissingProducts: 0
    };
  }

  /**
   * 진행률 초기화
   */
  private resetProgress(): void {
    this.progress = this.getDefaultProgress();
  }

  /**
   * Gap Detection 수행 (실제 IPC 통신)
   */
  private async performGapDetection(): Promise<GapDetectionResult> {
    try {
      // 실제 Gap Detection Service 호출
      const result = await this.gapDetectionService.detectGaps();
      
      if (!result.success || !result.data) {
        throw new Error(result.error?.message || 'Gap detection failed');
      }

      // IPC 결과를 ViewModel 형식으로 변환
      const ipcResult = result.data;
      
      // IPC 결과는 이미 새로운 GapDetectionResult 형식이므로 그대로 반환
      return {
        totalMissingProducts: ipcResult.totalMissingProducts,
        missingPages: ipcResult.missingPages,
        completelyMissingPageIds: ipcResult.completelyMissingPageIds,
        partiallyMissingPageIds: ipcResult.partiallyMissingPageIds,
        summary: ipcResult.summary,
        crawlingRanges: ipcResult.crawlingRanges,
        totalSitePages: ipcResult.totalSitePages,
        batchInfo: ipcResult.batchInfo
      };
    } catch (error) {
      this.logStore.addLog(
        `Gap detection service call failed: ${error}`,
        'error',
        'GAP_DETECTION'
      );
      throw error;
    }
  }

  /**
   * Gap Collection 수행 (실제 IPC 통신)
   */
  private async performGapCollection(pages: number[]): Promise<void> {
    try {
      // 최신 config를 CrawlingService에서 가져옴
      const crawlingService = CrawlingService.getInstance();
      const configResult = await crawlingService.getConfig();
      if (!configResult.success || !configResult.data) {
        throw new Error('Failed to fetch current crawler config');
      }
      

      // Gap Collection 특화 옵션만 오버라이드
      const options = {
        maxConcurrentPages: this.options.maxConcurrentPages,
        delayBetweenPages: this.options.delayBetweenPages,
        maxRetries: this.options.maxRetries,
        autoCollect: this.options.autoCollect,
        enableRetry: this.options.enableRetry,
        notificationEnabled: this.options.notificationEnabled,
        useExtendedCollection: this.options.useExtendedCollection
      };

      // Gap Detection 결과가 반드시 필요
      if (!this.result) throw new Error('No gap detection result available');
      // 실제 Gap Collection Service 호출
      const result = await this.gapDetectionService.collectGaps(this.result, options);
      if (!result.success || !result.data) {
        throw new Error(result.error?.message || 'Gap collection failed');
      }
      const collectionResult = result.data;
      runInAction(() => {
        this.progress.collectedPages = collectionResult.collected;
        this.progress.failedPages = collectionResult.failedPages.slice();
        if (collectionResult.errors.length > 0) {
          this.progress.errors = collectionResult.errors.map((error: string) => ({
            page: 0,
            error: error,
            timestamp: new Date()
          }));
        }
      });
      this.logStore.addLog(
        `Gap collection completed for ${pages.length} pages: ${collectionResult.collected} collected, ${collectionResult.failed} failed`,
        'info',
        'GAP_DETECTION'
      );
    } catch (error) {
      this.logStore.addLog(
        `Gap collection service call failed: ${error}`,
        'error',
        'GAP_DETECTION'
      );
      throw error;
    }
  }

  /**
   * Gap Batch Collection 수행 (실제 IPC 통신)
   */
  private async performGapBatchCollection(): Promise<{
    gapResult: GapDetectionResult | null;
    collectionResult: any | null;
  }> {
    try {
      // 최신 config를 CrawlingService에서 가져옴
      const crawlingService = CrawlingService.getInstance();
      const configResult = await crawlingService.getConfig();
      if (!configResult.success || !configResult.data) {
        throw new Error('Failed to fetch current crawler config');
      }
      const currentConfig = configResult.data;

      // Gap Collection 특화 옵션만 오버라이드
      const config: CrawlerConfig = {
        ...currentConfig,
        maxConcurrentTasks: this.options.maxConcurrentPages,
        requestDelay: this.options.delayBetweenPages,
        productListRetryCount: this.options.maxRetries,
        // 기존 값 유지: productsPerPage, baseUrl 등
      };

      // productsPerPage 값 확인 및 로깅
      this.logStore.addLog(
        `Gap Batch Collection config: productsPerPage=${config.productsPerPage}, maxConcurrentTasks=${config.maxConcurrentTasks}`,
        'info',
        'GAP_DETECTION'
      );

      // 실제 Gap Batch Collection Service 호출
      const result = await this.gapDetectionService.executeGapBatchCollection(config);
      if (!result.success) {
        throw new Error(result.error?.message || 'Gap batch collection failed');
      }
      return {
        gapResult: result.data?.gapResult || null,
        collectionResult: result.data?.collectionResult || null
      };
    } catch (error) {
      this.logStore.addLog(
        `Gap batch collection service call failed: ${error}`,
        'error',
        'GAP_DETECTION'
      );
      throw error;
    }
  }

  /**
   * Operation Cancellation 수행 (실제 IPC 통신)
   */
  private async performOperationCancellation(): Promise<void> {
    try {
      // Gap Detection/Collection 작업이 진행 중인 경우 취소 요청
      // 현재는 로깅만 하고 실제 취소 로직은 필요시 구현
      this.logStore.addLog(
        'Requesting cancellation of gap detection/collection operation',
        'info',
        'GAP_DETECTION'
      );
      
      // 실제 백엔드 취소 IPC 호출은 필요시 추가
      // await this.gapDetectionService.cancelOperation();
      
    } catch (error) {
      this.logStore.addLog(
        `Operation cancellation failed: ${error}`,
        'warning',
        'GAP_DETECTION'
      );
      // 취소 실패는 에러로 처리하지 않음 (이미 완료되었을 수 있음)
    }
  }

  /**
   * 오류 처리 헬퍼
   */
  protected handleError(message: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const fullMessage = `${message}: ${errorMessage}`;
    
    runInAction(() => {
      this.error = fullMessage;
      this.stage = GapDetectionStage.ERROR;
    });

    this.logStore.addLog(fullMessage, 'error', 'GAP_DETECTION');
    console.error(`[GapDetectionViewModel] ${fullMessage}`, error);
  }

  // === Lifecycle Methods ===

  /**
   * ViewModel 초기화
   */
  public async initialize(): Promise<void> {
    try {
      await super.initialize();
      this.resetState();
      this.logStore.addLog('GapDetectionViewModel initialized', 'info', 'GAP_DETECTION');
    } catch (error) {
      this.handleError('Failed to initialize GapDetectionViewModel', error);
    }
  }

  /**
   * ViewModel 정리
   */
  public dispose(): void {
    try {
      if (this.canCancel) {
        this.cancelOperation();
      }
      this.resetState();
      super.dispose();
      this.logStore.addLog('GapDetectionViewModel disposed', 'info', 'GAP_DETECTION');
    } catch (error) {
      console.error('[GapDetectionViewModel] Error during disposal:', error);
    }
  }
}
