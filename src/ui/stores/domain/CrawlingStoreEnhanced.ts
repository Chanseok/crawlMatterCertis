/**
 * CrawlingStoreEnhanced.ts
 * Phase 1 개선: 진행 상황 업데이트 시스템 개선
 * 
 * CrawlingStore의 개선된 버전으로, 단계별 진행 상황 및 세션 관리 기능을 추가
 */

import { makeObservable, observable, action, runInAction, computed } from 'mobx';
import { IPCService, IPCUnsubscribeFunction, ipcService } from '../../services/IPCService';
import { v4 as uuidv4 } from 'uuid';

import type {
  CrawlingProgress,
  CrawlingStatus,
  CrawlerConfig,
  CrawlingError,
  CrawlingStatusSummary,
  // 새로운 타입들
  StageProgress,
  CrawlingSessionProgress,
  BatchProgress,
  CrawlingStageId,
  StageStatus
} from '../../../../types';

// 기본 StageProgress 생성 함수
const createInitialStageProgress = (stageId: CrawlingStageId): StageProgress => ({
  stageId,
  status: 'pending',
  current: 0,
  total: 0,
  percentage: 0,
  currentStep: '대기 중...',
  elapsedTime: 0
});

// 초기 세션 진행 상황 상태
const createInitialSessionProgress = (): CrawlingSessionProgress => ({
  sessionId: uuidv4(),
  overallStatus: 'idle',
  stages: {
    'status-check': createInitialStageProgress('status-check'),
    'product-list': createInitialStageProgress('product-list'),
    'db-comparison': createInitialStageProgress('db-comparison'),
    'product-detail': createInitialStageProgress('product-detail')
  },
  currentStage: null,
  startTime: new Date(),
  totalElapsedTime: 0
});

// 기존 CrawlingProgress 타입과의 호환성을 위한 초기값
const initialProgress: CrawlingProgress = {
  current: 0,
  total: 0,
  percentage: 0,
  status: 'idle',
  currentStep: '대기 중...',
  elapsedTime: 0,
  startTime: 0,
  message: '대기 중...',
  currentStage: 0,
};

/**
 * 개선된 CrawlingStore 클래스
 * 단계별 진행 상황 및 세션 관리 기능 추가
 */
export class CrawlingStoreEnhanced {
  // 기존 필드들 (호환성 유지)
  @observable status: CrawlingStatus = 'idle';
  @observable progress: CrawlingProgress = { ...initialProgress };
  @observable error: CrawlingError | null = null;
  @observable config: CrawlerConfig = {} as CrawlerConfig;
  @observable statusSummary: CrawlingStatusSummary | null = null;
  @observable lastStatusSummary: CrawlingStatusSummary | null = null;
  @observable isCheckingStatus: boolean = false;
  @observable currentMessage: string = '대기 중...';
  @observable highestStageReached: number = 0;

  // 새로운 필드들
  @observable session: CrawlingSessionProgress = createInitialSessionProgress();
  @observable batchProgress: BatchProgress | null = null;
  
  // 타이머 및 구독 관리
  private updateTimer: number | null = null;
  private unsubscribeCrawlingProgress: IPCUnsubscribeFunction | null = null;
  private unsubscribeCrawlingComplete: IPCUnsubscribeFunction | null = null;
  private unsubscribeCrawlingError: IPCUnsubscribeFunction | null = null;
  private unsubscribeCrawlingStopped: IPCUnsubscribeFunction | null = null;
  private unsubscribeCrawlingStatusSummary: IPCUnsubscribeFunction | null = null;
  private unsubscribeCrawlingTaskStatus: IPCUnsubscribeFunction | null = null;

  constructor(private ipcServiceInstance: IPCService) {
    console.log('[CrawlingStoreEnhanced] Constructor called');
    
    makeObservable(this, {
      // 기존 Observable 필드들은 자동으로 tracked 됨
      startCrawling: action,
      stopCrawling: action,
      checkStatus: action,
      updateProgress: action,
      updateStageProgress: action, // 새로운 메소드
      setCurrentStage: action,     // 새로운 메소드
      clearError: action,
      setConfig: action,
      loadConfig: action,
      updateConfig: action,
      cleanup: action,
      resetSession: action,        // 새로운 메소드
      // Computed
      currentStageProgress: computed,
    });
    
    console.log('[CrawlingStoreEnhanced] About to subscribe to events');
    this.subscribeToEvents();
    this.startTimeUpdates();
    console.log('[CrawlingStoreEnhanced] Constructor completed');
  }

  // Computed properties
  public get isRunning(): boolean {
    return this.status === 'running' || this.status === 'initializing';
  }

  public get canStart(): boolean {
    return this.status === 'idle' || this.status === 'error' || this.status === 'completed';
  }

  public get canStop(): boolean {
    return this.status === 'running' || this.status === 'initializing' || this.status === 'paused';
  }

  public get canPause(): boolean {
    return this.status === 'running';
  }

  // 현재 활성화된 단계의 진행 상황 조회
  public get currentStageProgress(): StageProgress | null {
    return this.session.currentStage 
      ? this.session.stages[this.session.currentStage] 
      : null;
  }

  /**
   * 이벤트 구독 설정
   * 기존의 IPC 이벤트를 구독하여 새로운 타입 체계로 변환
   */
  private subscribeToEvents(): void {
    console.log('[CrawlingStoreEnhanced] 🔗 Subscribing to IPC events...');
    
    try {
      // 기존 이벤트 구독은 유지
      this.unsubscribeCrawlingProgress = this.ipcServiceInstance.subscribeCrawlingProgress((data) => {
        this.updateProgress(data);
        
        // 새로운 타입 체계로 변환하여 StageProgress 업데이트
        this.convertAndUpdateStageProgress(data);
      });

      this.unsubscribeCrawlingComplete = this.ipcServiceInstance.subscribeCrawlingComplete(() => {
        runInAction(() => {
          this.status = 'completed';
          this.session.overallStatus = 'completed';
          this.session.endTime = new Date();
          
          if (this.session.currentStage) {
            const currentStage = this.session.stages[this.session.currentStage];
            currentStage.status = 'completed';
            currentStage.endTime = new Date();
          }
        });
      });

      this.unsubscribeCrawlingError = this.ipcServiceInstance.subscribeCrawlingError((error) => {
        runInAction(() => {
          this.error = error;
          this.status = 'error';
          this.session.overallStatus = 'error';
          
          if (this.session.currentStage) {
            const currentStage = this.session.stages[this.session.currentStage];
            currentStage.status = 'failed';
            currentStage.error = error;
            currentStage.endTime = new Date();
          }
        });
      });

      this.unsubscribeCrawlingStopped = this.ipcServiceInstance.subscribeCrawlingStopped(() => {
        runInAction(() => {
          this.status = 'stopped';
          this.session.overallStatus = 'idle';
          
          if (this.session.currentStage) {
            const currentStage = this.session.stages[this.session.currentStage];
            currentStage.status = 'pending';
          }
        });
      });

      this.unsubscribeCrawlingStatusSummary = this.ipcServiceInstance.subscribeCrawlingStatusSummary((summary) => {
        runInAction(() => {
          this.statusSummary = summary;
          this.lastStatusSummary = { ...summary };
          
          // 상태 체크 단계를 완료로 표시
          const statusCheckStage = this.session.stages['status-check'];
          statusCheckStage.status = 'completed';
          statusCheckStage.current = 1;
          statusCheckStage.total = 1;
          statusCheckStage.percentage = 100;
          statusCheckStage.endTime = new Date();
        });
      });

      this.unsubscribeCrawlingTaskStatus = this.ipcServiceInstance.subscribeCrawlingTaskStatus((taskStatus) => {
        // 기존 이벤트 처리에 추가로 세션 상태 업데이트
        runInAction(() => {
          this.isCheckingStatus = taskStatus?.isRunning || false;
          
          if (this.isCheckingStatus) {
            this.setCurrentStage('status-check');
            this.session.stages['status-check'].status = 'running';
            this.session.stages['status-check'].startTime = new Date();
          }
        });
      });

    } catch (e) {
      console.error('[CrawlingStoreEnhanced] Error subscribing to events:', e);
    }
  }

  /**
   * 기존 CrawlingProgress 데이터를 새로운 StageProgress로 변환하여 업데이트
   */
  private convertAndUpdateStageProgress(data: CrawlingProgress): void {
    // 현재 스테이지 결정 (기존 currentStage는 숫자)
    let stageId: CrawlingStageId = 'status-check';
    
    if (data.currentStage === 1) {
      stageId = 'product-list';
    } else if (data.currentStage === 2) {
      stageId = 'db-comparison';
    } else if (data.currentStage === 3) {
      stageId = 'product-detail';
    }

    // 배치 정보 추출
    if (data.currentBatch !== undefined && data.totalBatches !== undefined) {
      runInAction(() => {
        this.batchProgress = {
          currentBatch: data.currentBatch || 0,
          totalBatches: data.totalBatches || 0,
          currentInBatch: data.current,
          totalInBatch: data.total,
          batchRetryCount: data.batchRetryCount,
          batchRetryLimit: data.batchRetryLimit
        };
      });
    }

    // 스테이지 진행 상태 업데이트
    const stageProgress: Partial<StageProgress> = {
      current: data.current,
      total: data.total,
      percentage: data.percentage,
      currentStep: data.currentStep || data.message,
      elapsedTime: data.elapsedTime,
      remainingTime: data.remainingTime,
      status: this.convertCrawlingStatusToStageStatus(data.status)
    };

    this.updateStageProgress(stageId, stageProgress);
  }

  /**
   * CrawlingStatus를 StageStatus로 변환
   */
  private convertCrawlingStatusToStageStatus(status?: CrawlingStatus): StageStatus {
    switch (status) {
      case 'running': return 'running';
      case 'completed': return 'completed';
      case 'error': return 'failed';
      case 'idle': return 'pending';
      case 'paused': return 'pending';
      case 'stopped': return 'pending';
      case 'initializing': return 'running';
      case 'completed_stage_1': return 'completed';
      default: return 'pending';
    }
  }

  /**
   * 단계별 진행 상황 업데이트
   */
  @action
  public updateStageProgress(stageId: CrawlingStageId, progress: Partial<StageProgress>): void {
    const stage = this.session.stages[stageId];
    
    // 단계가 처음 실행되는 경우 시작 시간 기록
    if (progress.status === 'running' && !stage.startTime) {
      stage.startTime = new Date();
    }
    
    // 단계가 완료되는 경우 완료 시간 기록
    if ((progress.status === 'completed' || progress.status === 'failed') && !stage.endTime) {
      stage.endTime = new Date();
    }

    // 진행 상황 업데이트
    runInAction(() => {
      Object.assign(stage, progress);
      
      // 현재 단계가 설정되지 않았다면 이 단계로 설정
      if (!this.session.currentStage && progress.status === 'running') {
        this.session.currentStage = stageId;
      }
    });
  }

  /**
   * 현재 활성 단계 설정
   */
  @action
  public setCurrentStage(stageId: CrawlingStageId): void {
    runInAction(() => {
      this.session.currentStage = stageId;
      const stage = this.session.stages[stageId];
      
      // 아직 시작되지 않은 단계라면 시작 상태로 변경
      if (stage.status === 'pending') {
        stage.status = 'running';
        stage.startTime = new Date();
      }
    });
  }

  /**
   * 세션 초기화
   */
  @action
  public resetSession(): void {
    runInAction(() => {
      this.session = createInitialSessionProgress();
      this.batchProgress = null;
    });
  }

  /**
   * 타이머 기반 시간 업데이트 시작
   */
  private startTimeUpdates(): void {
    // 이전 타이머가 있으면 제거
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
    
    // 1초마다 경과 시간 업데이트
    this.updateTimer = setInterval(() => {
      runInAction(() => {
        // 세션이 활성화된 경우에만 경과 시간 업데이트
        if (this.session.overallStatus === 'running' || this.isRunning) {
          const now = new Date();
          this.session.totalElapsedTime = now.getTime() - this.session.startTime.getTime();
          
          // 현재 단계가 있는 경우 해당 단계의 경과 시간도 업데이트
          if (this.session.currentStage) {
            const currentStage = this.session.stages[this.session.currentStage];
            if (currentStage.startTime && currentStage.status === 'running') {
              currentStage.elapsedTime = now.getTime() - currentStage.startTime.getTime();
            }
          }
        }
      });
    }, 1000);
  }

  // 기존 메소드들 유지 (startCrawling, stopCrawling 등)

  @action
  public async startCrawling(): Promise<void> {
    try {
      console.log('[CrawlingStoreEnhanced] Starting crawling...');
      
      // 새로운 세션 시작
      this.resetSession();
      this.session.overallStatus = 'running';
      this.session.startTime = new Date();
      
      // 기존 로직 유지
      runInAction(() => {
        this.status = 'initializing';
        this.error = null;
      });
      await this.ipcServiceInstance.startCrawling();
      
    } catch (err) {
      console.error('[CrawlingStoreEnhanced] Error starting crawling:', err);
      runInAction(() => {
        this.error = { message: '크롤링 시작 실패', name: 'StartCrawlingError' };
        this.status = 'error';
        this.session.overallStatus = 'error';
      });
    }
  }
  
  @action
  public async stopCrawling(): Promise<void> {
    try {
      console.log('[CrawlingStoreEnhanced] Stopping crawling...');
      runInAction(() => {
        this.status = 'idle'; // 즉시 UI 상태 업데이트
        this.session.overallStatus = 'idle';
      });
      await this.ipcServiceInstance.stopCrawling();
    } catch (err) {
      console.error('[CrawlingStoreEnhanced] Error stopping crawling:', err);
      runInAction(() => {
        this.error = { message: '크롤링 중지 실패', name: 'StopCrawlingError' };
      });
    }
  }
  
  @action
  public async checkStatus(): Promise<void> {
    try {
      console.log('[CrawlingStoreEnhanced] 🔍 Checking status...');
      runInAction(() => {
        this.isCheckingStatus = true;
        this.setCurrentStage('status-check');
      });
      await this.ipcServiceInstance.checkCrawlingStatus();
    } catch (err) {
      console.error('[CrawlingStoreEnhanced] Error checking status:', err);
      runInAction(() => {
        this.error = { message: '상태 확인 실패', name: 'CheckStatusError' };
        this.isCheckingStatus = false;
        this.updateStageProgress('status-check', { status: 'failed' });
      });
    }
  }

  @action
  public updateProgress(data: CrawlingProgress): void {
    console.log('[CrawlingStoreEnhanced] 📊 Receiving progress update:', data);
    
    runInAction(() => {
      // 최고 단계 기록 (기존 로직과 동일)
      if (data.currentStage !== undefined && data.currentStage > this.highestStageReached) {
        this.highestStageReached = data.currentStage;
      }
      
      // 기존 progress 객체 업데이트 (호환성 유지)
      this.progress = { ...data };
      
      // 상태 업데이트
      if (data.status) {
        this.status = data.status;
        this.session.overallStatus = this.convertCrawlingStatusToSessionStatus(data.status);
      }
      
      // 현재 메시지 업데이트
      if (data.message) {
        this.currentMessage = data.message;
      }
    });
  }

  /**
   * CrawlingStatus를 세션 상태로 변환
   */
  private convertCrawlingStatusToSessionStatus(status: CrawlingStatus): CrawlingStatus {
    // 세션 상태는 기존 CrawlingStatus와 동일하게 유지
    return status;
  }

  @action
  public clearError(): void {
    runInAction(() => {
      this.error = null;
    });
  }

  @action
  public setConfig(config: CrawlerConfig): void {
    runInAction(() => {
      this.config = { ...config };
    });
  }

  @action
  public async loadConfig(): Promise<void> {
    try {
      const config = await this.ipcServiceInstance.getConfig();
      runInAction(() => {
        this.config = { ...config };
      });
    } catch (err) {
      console.error('[CrawlingStoreEnhanced] Error loading config:', err);
      runInAction(() => {
        this.error = { message: '설정 로드 실패', name: 'ConfigLoadError' };
      });
      throw err;
    }
  }

  @action
  public async updateConfig(newConfig: CrawlerConfig): Promise<void> {
    try {
      await this.ipcServiceInstance.updateConfig(newConfig);
      runInAction(() => {
        this.config = { ...newConfig };
      });
    } catch (err) {
      console.error('[CrawlingStoreEnhanced] Error updating config:', err);
      runInAction(() => {
        this.error = { message: '설정 저장 실패', name: 'ConfigSaveError' };
      });
      throw err;
    }
  }

  public getDebugInfo(): any {
    return {
      status: this.status,
      progress: this.progress,
      session: this.session,
      batchProgress: this.batchProgress,
      error: this.error,
      config: this.config,
      statusSummary: this.statusSummary,
      isRunning: this.isRunning,
      canStart: this.canStart,
      canStop: this.canStop,
      canPause: this.canPause,
    };
  }

  @action
  public cleanup(): void {
    console.log('[CrawlingStoreEnhanced] Cleaning up subscriptions');
    
    // 타이머 정리
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    
    // 구독 정리
    this.unsubscribeCrawlingProgress?.();
    this.unsubscribeCrawlingComplete?.();
    this.unsubscribeCrawlingError?.();
    this.unsubscribeCrawlingStopped?.();
    this.unsubscribeCrawlingStatusSummary?.();
    this.unsubscribeCrawlingTaskStatus?.();
    
    // 상태 초기화
    this.progress = { ...initialProgress };
    this.resetSession();
    this.status = 'idle';
    this.error = null;
    this.currentMessage = '대기 중...';
  }
}

console.log('[CrawlingStoreEnhanced] 🏭 Creating singleton CrawlingStoreEnhanced instance...');
export const crawlingStoreEnhanced = new CrawlingStoreEnhanced(ipcService);
console.log('[CrawlingStoreEnhanced] 🏭 Singleton CrawlingStoreEnhanced instance created successfully');
