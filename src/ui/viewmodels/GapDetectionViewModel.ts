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
import type { GapCollectionOptions as IPCGapCollectionOptions } from '../../../types';

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
}

/**
 * Gap Detection 결과 정보
 */
export interface GapDetectionResult {
  totalMissingPages: number;
  missingPagesList: number[];
  missingProductsCount: number;
  detectionTime: number;
  lastDetectionDate: Date;
  analysisDetails?: {
    largestGap: {
      startPage: number;
      endPage: number;
      count: number;
    };
    gapPatterns: Array<{
      range: [number, number];
      count: number;
    }>;
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
    return this.result !== null && this.result.missingPagesList.length > 0;
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

      // TODO: IPC 통신으로 백엔드 Gap Detection 호출
      const detectionResult = await this.performGapDetection();
      
      runInAction(() => {
        this.result = detectionResult;
        this.stage = GapDetectionStage.COMPLETED;
        this.lastOperation = `Detection completed - ${detectionResult.totalMissingPages} gaps found`;
      });

      this.logStore.addLog(
        `Gap detection completed: ${detectionResult.totalMissingPages} missing pages found`,
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
      this.progress.totalPages = this.result!.missingPagesList.length;

      this.logStore.addLog(
        `Starting gap collection for ${this.result!.missingPagesList.length} pages...`,
        'info',
        'GAP_DETECTION'
      );

      // TODO: IPC 통신으로 백엔드 Gap Collection 호출
      await this.performGapCollection(this.result!.missingPagesList);
      
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
   * 현재 작업 취소
   */
  @action async cancelOperation(): Promise<void> {
    if (!this.canCancel) return;

    try {
      // TODO: IPC 통신으로 백엔드 작업 취소 요청
      
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
      notificationEnabled: true
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
      errors: []
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
    const startTime = Date.now();
    
    try {
      // 실제 Gap Detection Service 호출
      const result = await this.gapDetectionService.detectGaps();
      
      if (!result.success || !result.data) {
        throw new Error(result.error?.message || 'Gap detection failed');
      }

      // IPC 결과를 ViewModel 형식으로 변환
      const ipcResult = result.data;
      return {
        totalMissingPages: ipcResult.missingPages.length,
        missingPagesList: ipcResult.completelyMissingPageIds.concat(ipcResult.partiallyMissingPageIds),
        missingProductsCount: ipcResult.totalMissingProducts,
        detectionTime: Date.now() - startTime,
        lastDetectionDate: new Date(),
        analysisDetails: {
          largestGap: {
            startPage: Math.min(...ipcResult.completelyMissingPageIds) || 0,
            endPage: Math.max(...ipcResult.completelyMissingPageIds) || 0,
            count: ipcResult.completelyMissingPageIds.length
          },
          gapPatterns: ipcResult.missingPages.map(page => ({
            range: [page.pageId, page.pageId] as [number, number],
            count: page.expectedCount - page.actualCount
          }))
        }
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
      // IPC 갭 탐지 결과를 먼저 얻어야 함
      const detectionResult = await this.gapDetectionService.detectGaps();
      
      if (!detectionResult.success || !detectionResult.data) {
        throw new Error('Gap detection failed before collection');
      }

      // Gap Collection 옵션 구성
      const collectionOptions: IPCGapCollectionOptions = {
        maxConcurrentPages: this.options.maxConcurrentPages,
        delayBetweenPages: this.options.delayBetweenPages,
        skipCompletePages: true,
        prioritizePartialPages: true
      };

      // 실제 Gap Collection Service 호출 (특정 페이지들에 대해)
      const result = await this.gapDetectionService.collectGaps(
        detectionResult.data,
        collectionOptions
      );
      
      if (!result.success || !result.data) {
        throw new Error(result.error?.message || 'Gap collection failed');
      }

      const collectionResult = result.data;
      
      // 결과를 진행률에 반영
      runInAction(() => {
        this.progress.collectedPages = collectionResult.collected;
        this.progress.failedPages = collectionResult.failedPages.slice();
        if (collectionResult.errors.length > 0) {
          this.progress.errors = collectionResult.errors.map(error => ({
            page: 0, // Gap collection doesn't provide specific page info
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
