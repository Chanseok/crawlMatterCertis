/**
 * CrawlingStore.ts
 * MobX-based Domain Store for Crawling Operations
 * 
 * Manages all crawling-related state including progress, status, configuration,
 * and crawling operations. Encapsulates crawling business logic.
 */

console.log('[CrawlingStore] 🔄 MODULE LOADING - CrawlingStore.ts module is being imported');

import { makeObservable, observable, action, runInAction } from 'mobx';
import { IPCService, ipcService } from '../../services/infrastructure/IPCService'; // Added ipcService import
import { crawlingProgressViewModel } from '../../viewmodels/CrawlingProgressViewModel';
import { getPlatformApi } from '../../platform/api';
import { storeEventBus, STORE_EVENTS } from '../../services/EventBus';

/*
interface CrawlingError {
  name: string;
  message: string;
  stack?: string;
}
*/

import type { CrawlingProgress, CrawlingStatus, CrawlerConfig, CrawlingError, CrawlingStatusSummary } from '../../../../types';

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

export class CrawlingStore {
  @observable accessor status: CrawlingStatus = 'idle';
  @observable accessor progress: CrawlingProgress = { ...initialProgress };
  @observable accessor error: CrawlingError | null = null;
  @observable accessor config: CrawlerConfig = {} as CrawlerConfig;
  @observable accessor statusSummary: CrawlingStatusSummary | null = null;
  @observable accessor lastStatusSummary: CrawlingStatusSummary | null = null;
  @observable accessor isCheckingStatus: boolean = false;
  @observable accessor currentMessage: string = '대기 중...';
  @observable accessor explicitlyStopped: boolean = false; // 명시적 중단 플래그
  @observable accessor isStopping: boolean = false; // 중지 중 상태 플래그
  
  // Track the highest stage reached to prevent stage regression
  @observable accessor highestStageReached: number = 0;

  private unsubscribeCrawlingProgress: (() => void) | null = null;
  private unsubscribeCrawlingComplete: (() => void) | null = null;
  private unsubscribeCrawlingError: (() => void) | null = null;
  private unsubscribeCrawlingStopped: (() => void) | null = null;
  private unsubscribeCrawlingStatusSummary: (() => void) | null = null;
  private unsubscribeCrawlingTaskStatus: (() => void) | null = null;
  private unsubscribeEventBus: (() => void) | null = null;

  constructor(private ipcServiceInstance: IPCService) {
    console.log('[CrawlingStore] Constructor called');
    console.log('[CrawlingStore] IPCService instance:', this.ipcServiceInstance);
    
    makeObservable(this, {
      // Note: @observable accessor properties don't need to be listed here
      // Arrow function properties with @action decorators don't need to be listed here
      startCrawling: action,
      stopCrawling: action,
      checkStatus: action,
      updateProgress: action,
      clearError: action,
      setConfig: action,
      loadConfig: action,
      updateConfig: action,
      cleanup: action,
    });
    
    console.log('[CrawlingStore] About to subscribe to events');
    this.subscribeToEvents();
    console.log('[CrawlingStore] Constructor completed');
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

  private subscribeToEvents(): void {
    console.log('[CrawlingStore] 🔗 Subscribing to IPC events...');
    console.log('[CrawlingStore] 🔗 IPC Service instance available:', !!this.ipcServiceInstance);
    
    try {
      console.log('[CrawlingStore] 🔗 Subscribing to crawlingProgress...');
      const progressUnsubscribe = this.ipcServiceInstance.subscribeToCrawlingProgress(
        this.handleCrawlingProgress
      );
      this.unsubscribeCrawlingProgress = progressUnsubscribe || (() => {});
      console.log('[CrawlingStore] 🔗 crawlingProgress subscription result:', !!progressUnsubscribe);
      
      console.log('[CrawlingStore] 🔗 Subscribing to crawlingComplete...');
      const completeUnsubscribe = this.ipcServiceInstance.subscribeToCrawlingComplete(
        this.handleCrawlingComplete
      );
      this.unsubscribeCrawlingComplete = completeUnsubscribe || (() => {});
      
      console.log('[CrawlingStore] 🔗 Subscribing to crawlingError...');
      const errorUnsubscribe = this.ipcServiceInstance.subscribeToCrawlingError(
        this.handleCrawlingError
      );
      this.unsubscribeCrawlingError = errorUnsubscribe || (() => {});
      
      console.log('[CrawlingStore] 🔗 Subscribing to crawlingStopped...');
      const stoppedUnsubscribe = this.ipcServiceInstance.subscribeCrawlingStopped(
        this.handleCrawlingStopped
      );
      this.unsubscribeCrawlingStopped = stoppedUnsubscribe || (() => {});
      
      console.log('[CrawlingStore] 🔗 Subscribing to crawlingStatusSummary...');
      const summaryUnsubscribe = this.ipcServiceInstance.subscribeToCrawlingStatusSummary(
        this.handleCrawlingStatusSummary
      );
      this.unsubscribeCrawlingStatusSummary = summaryUnsubscribe || (() => {});
      
      console.log('[CrawlingStore] 🔗 Subscribing to crawlingTaskStatus via platform API...');
      // Use the same platform API subscription mechanism as TaskStore to avoid conflicts
      const platformApi = getPlatformApi();
      if (platformApi && typeof platformApi.subscribeToEvent === 'function') {
        this.unsubscribeCrawlingTaskStatus = platformApi.subscribeToEvent('crawlingTaskStatus', (data: any) => {
          console.log('[CrawlingStore] 🎯 Received crawlingTaskStatus via platform API. Data:', JSON.stringify(data, null, 2));
          this.handleCrawlingTaskStatus(data);
        });
      } else {
        console.warn('[CrawlingStore] Platform API not available for crawlingTaskStatus subscription');
        this.unsubscribeCrawlingTaskStatus = () => {};
      }

      // Subscribe to EventBus for store communication
      console.log('[CrawlingStore] 🔗 Subscribing to EventBus events...');
      this.unsubscribeEventBus = storeEventBus.on(STORE_EVENTS.CRAWLING_TASK_STATUS, (data: any) => {
        console.log('[CrawlingStore] 🎯 Received crawlingTaskStatus via EventBus. Data:', JSON.stringify(data, null, 2));
        this.handleCrawlingTaskStatus(data);
      });
      
      console.log('[CrawlingStore] 🔗 All event subscriptions completed successfully');
    } catch (error) {
      console.error('[CrawlingStore] 🔗 ERROR during event subscription:', error);
    }
  }

  @action
  private handleCrawlingProgress = (progress: CrawlingProgress): void => {
    console.log('[CrawlingStore] 🚀 handleCrawlingProgress RECEIVED EVENT. Data:', JSON.stringify(progress, null, 2));
    console.log('[CrawlingStore] 🚀 Current store state before update:', {
      currentStatus: this.status,
      currentStage: this.progress.currentStage,
      currentStep: this.progress.currentStep,
      currentMessage: this.currentMessage,
      explicitlyStopped: this.explicitlyStopped
    });
    
    // 명시적으로 중단된 상태에서는 진행률 업데이트를 무시
    if (this.explicitlyStopped) {
      console.log('[CrawlingStore] 🚀 Ignoring progress update - explicitly stopped');
      return;
    }
    
    runInAction(() => {
      const newProgress = { ...this.progress, ...progress };
      if (progress.currentStage === undefined && this.progress.currentStage !== undefined) {
        newProgress.currentStage = this.progress.currentStage;
        console.log(`[CrawlingStore] Preserving currentStage: ${newProgress.currentStage}`);
      }
      if (progress.currentStep === undefined && this.progress.currentStep !== undefined) {
        newProgress.currentStep = this.progress.currentStep;
        console.log(`[CrawlingStore] Preserving currentStep: "${newProgress.currentStep}"`);
      }
      
      this.progress = newProgress;
      this.status = progress.status || this.status;
      if (progress.message) {
        this.currentMessage = progress.message;
      }
      
      // CrawlingProgressViewModel 업데이트
      crawlingProgressViewModel.updateProgress(newProgress);
      
      console.log('[CrawlingStore] 🚀 Store state AFTER update:', {
        newStatus: this.status,
        newStage: this.progress.currentStage,
        newStep: this.progress.currentStep,
        newMessage: this.currentMessage,
        newProgress: this.progress
      });
    });
  };

  @action
  private handleCrawlingComplete = (data: any): void => {
    console.log('[CrawlingStore] Crawling complete:', data);
    runInAction(() => {
      this.status = 'completed';
      this.explicitlyStopped = false; // 정상 완료 시 플래그 리셋
      this.progress = {
        ...this.progress,
        status: 'completed',
        percentage: 100,
        currentStep: '크롤링 완료',
        message: data?.message || '크롤링이 성공적으로 완료되었습니다.'
      };
      
      // CrawlingProgressViewModel을 완료 상태로 설정
      crawlingProgressViewModel.setCompleted();
    });
  };

  @action
  private handleCrawlingError = (error: CrawlingError): void => {
    console.error('[CrawlingStore] Crawling error:', error);
    runInAction(() => {
      this.error = error;
      this.status = 'error';
      this.progress = {
        ...this.progress,
        status: 'error',
        currentStep: '오류 발생',
        message: error?.message || '크롤링 중 오류가 발생했습니다.'
      };
    });
  };

  @action
  private handleCrawlingStopped = (data: any): void => {
    console.log('[CrawlingStore] 🛑 Crawling stopped event received:', data);
    console.log('[CrawlingStore] 🛑 Current isStopping state before reset:', this.isStopping);
    
    runInAction(() => {
      this.status = 'idle';
      this.explicitlyStopped = false; // 중단 완료 후 플래그 리셋
      this.isStopping = false; // 중지 중 상태 해제
      this.progress = {
        ...this.progress,
        status: 'idle',
        currentStep: '크롤링 중단됨',
        message: data?.message || '크롤링이 중단되었습니다.'
      };
      
      // CrawlingProgressViewModel 리셋
      crawlingProgressViewModel.reset();
    });
    
    // 중지 완료 로그 추가
    console.log('[CrawlingStore] 🔄 Stopping state cleared - isStopping:', this.isStopping);
    console.log('[CrawlingStore] 🔄 Final status:', this.status);
  };

  @action
  private handleCrawlingStatusSummary = (summary: CrawlingStatusSummary): void => {
    console.log('[CrawlingStore] Crawling status summary received:', JSON.stringify(summary));
    runInAction(() => {
      this.lastStatusSummary = this.statusSummary ? { ...this.statusSummary } : null;
      this.statusSummary = summary;
    });
  };

  @action
  private handleCrawlingTaskStatus = (data: any): void => {
    console.log('[CrawlingStore] 🎯 handleCrawlingTaskStatus RECEIVED EVENT. Data:', JSON.stringify(data, null, 2));
    
    try {
      // Extract stage information from crawlingTaskStatus event
      let stage = 0;
      let step = '대기 중...';
      let message = '대기 중...';
      
      if (data && typeof data === 'object') {
        // Parse the stage information from the task status message
        if (data.stage !== undefined) {
          stage = data.stage;
        }
        
        if (data.message) {
          message = data.message;
          step = data.message;
          
          // Try to parse message as JSON if it looks like JSON
          try {
            if (typeof data.message === 'string' && data.message.trim().startsWith('{')) {
              const parsedMessage = JSON.parse(data.message);
              console.log('[CrawlingStore] 🎯 Parsed JSON message:', parsedMessage);
              
              if (parsedMessage.stage !== undefined) {
                stage = parsedMessage.stage;
                console.log('[CrawlingStore] 🎯 Extracted stage from JSON message:', stage);
              }
              
              // Create a more user-friendly step message
              if (parsedMessage.type === 'page') {
                step = `페이지 ${parsedMessage.pageNumber || '?'} 크롤링 중...`;
              } else if (parsedMessage.type === 'product') {
                step = `상품 상세 정보 크롤링 중...`;
              } else {
                step = `Stage ${stage} 진행 중...`;
              }
              
              message = step;
            }
          } catch (parseError) {
            console.log('[CrawlingStore] 🎯 Message is not JSON, using as-is:', data.message);
          }
        }
        
        // Try to extract stage from message string if not found yet
        if (stage === 0 && typeof message === 'string') {
          const stageMatch = message.match(/stage[:\s]*(\d+)/i);
          if (stageMatch) {
            stage = parseInt(stageMatch[1], 10);
            console.log('[CrawlingStore] 🎯 Extracted stage from message string:', stage);
          }
        }
      }
      
      console.log('[CrawlingStore] 🎯 Parsed task status - stage:', stage, 'step:', step, 'message:', message);
      
      runInAction(() => {
        // Enhanced stage logic to handle sequential progression: 1 → 2 → 3
        let displayStage = stage;
        let displayStep = step;
        let displayMessage = message;
        
        // Map validation stages to Stage 2 (기존 1.5를 2로 변경)
        if (typeof message === 'string') {
          if (message.includes('2/4단계') || message.includes('DB 중복 검증') || message.includes('validation')) {
            displayStage = 2;
            displayStep = '2단계: 중복 검증';
            displayMessage = message.replace('2/4단계', '2단계');
          }
          // Map stage 1 completion to transition message
          else if (message.includes('1단계: 제품 목록 수집이 완료되었습니다')) {
            displayStage = 1;
            displayStep = '1단계 완료';
            displayMessage = '1단계: 제품 목록 수집 완료. 중복 검증 시작...';
          }
          // Map stage 3 preparation (기존 stage 2를 stage 3으로 변경)
          else if (message.includes('3단계: 제품 상세 정보 수집 준비 중')) {
            displayStage = 3;
            displayStep = '3단계: 제품 상세 정보 수집 준비';
            displayMessage = '3단계: 제품 상세 정보 수집 준비 중...';
          }
        }
        
        // Enhanced stage priority logic: allow progression through 1 → 2 → 3
        // Define stage order: 0 < 1 < 2 < 3
        const shouldUpdateStage = this.isStageProgression(displayStage, this.highestStageReached);
        
        if (shouldUpdateStage) {
          // Update highest stage reached
          if (this.isStageProgression(displayStage, this.highestStageReached)) {
            this.highestStageReached = displayStage;
            console.log('[CrawlingStore] 🎯 New highest stage reached:', displayStage);
          }
          
          // Update progress with enhanced stage information
          this.progress = {
            ...this.progress,
            currentStage: displayStage, // Keep actual stage value (1, 2, 3)
            currentStep: displayStep,
            message: displayMessage,
            status: 'running'
          };
          
          this.status = 'running';
          this.currentMessage = displayMessage;
          
          console.log('[CrawlingStore] 🎯 Store state AFTER enhanced crawlingTaskStatus update:', {
            originalStage: stage,
            displayStage: displayStage,
            uiStage: displayStage, // Now always integer
            newStatus: this.status,
            newStep: this.progress.currentStep,
            newMessage: this.currentMessage,
            highestStageReached: this.highestStageReached
          });
        } else {
          console.log('[CrawlingStore] 🎯 Skipping stage update - display stage:', displayStage, 'is lower than highest reached:', this.highestStageReached);
        }
      });
    } catch (error) {
      console.error('[CrawlingStore] 🎯 Error processing crawlingTaskStatus:', error);
    }
  };

  // 스테이지 진행 순서를 확인하는 헬퍼 메서드
  private isStageProgression(newStage: number, currentHighestStage: number): boolean {
    // Stage 순서: 0 < 1 < 2 < 3 (1=List, 2=Validation, 3=Detail)
    // 정확한 진행 순서를 확인
    
    if (newStage === currentHighestStage) {
      return true; // 같은 스테이지는 업데이트 허용 (메시지 업데이트)
    }
    
    // 순차적 진행 체크
    if (currentHighestStage === 0 && newStage === 1) return true;  // 0 → 1
    if (currentHighestStage === 1 && newStage === 2) return true;  // 1 → 2 (validation)
    if (currentHighestStage === 2 && newStage === 3) return true;  // 2 → 3 (detail)
    
    // 역행 방지: 이미 더 높은 스테이지에 도달했다면 낮은 스테이지로 돌아가지 않음
    if (newStage < currentHighestStage) {
      console.log('[CrawlingStore] 🚫 Stage regression blocked:', {
        newStage,
        currentHighestStage,
        blocked: true
      });
      return false;
    }
    
    return newStage >= currentHighestStage;
  }

  /**
   * Handle crawlingTaskStatus events forwarded from TaskStore
   * This is used when direct platform API subscription fails due to initialization timing
   */
  @action
  public handleCrawlingTaskStatusFromTaskStore = (data: any): void => {
    console.log('[CrawlingStore] 🎯 Received forwarded crawlingTaskStatus from TaskStore. Data:', JSON.stringify(data, null, 2));
    
    // Use the same logic as handleCrawlingTaskStatus
    this.handleCrawlingTaskStatus(data);
  };

  // Helper method to extract only serializable properties from config
  private extractSerializableConfig(config: any): any {
    if (!config || typeof config !== 'object') {
      return {};
    }
    
    const serializable: any = {};
    
    // config의 각 속성을 검사하여 직렬화 가능한 것만 추출
    for (const [key, value] of Object.entries(config)) {
      if (this.isSerializable(value)) {
        serializable[key] = value;
      } else {
        console.warn(`[CrawlingStore] Skipping non-serializable property: ${key}`);
      }
    }
    
    return serializable;
  }
  
  // Check if a value is serializable
  private isSerializable(value: any): boolean {
    if (value === null || value === undefined) {
      return true;
    }
    
    const type = typeof value;
    if (type === 'string' || type === 'number' || type === 'boolean') {
      return true;
    }
    
    if (type === 'object') {
      // Arrays and plain objects are serializable
      if (Array.isArray(value)) {
        return value.every(item => this.isSerializable(item));
      }
      
      // Check if it's a plain object
      if (value.constructor === Object) {
        return Object.values(value).every(val => this.isSerializable(val));
      }
      
      // Other objects (functions, classes, etc.) are not serializable
      return false;
    }
    
    // Functions and other types are not serializable
    return false;
  }

  @action
  public startCrawling(startConfig?: Partial<CrawlerConfig>): Promise<boolean> {
    console.log('[CrawlingStore] Attempting to start crawling...', startConfig);
    this.error = null;
    this.explicitlyStopped = false; // 새로운 크롤링 시작 시 플래그 리셋
    this.status = 'initializing';
    this.progress = { ...initialProgress, status: 'initializing', currentStep: '크롤링 시작 중...', startTime: Date.now() };
    // Reset stage tracking when starting new crawling session
    this.highestStageReached = 0;
    
    // CrawlingProgressViewModel 리셋
    crawlingProgressViewModel.reset(); 
    
    // 간단하고 안전한 config 객체 생성
    let configToSend: any = {};
    
    if (startConfig) {
      // startConfig가 있으면 직접 사용하되, 직렬화 가능한 부분만 추출
      try {
        configToSend = this.extractSerializableConfig(startConfig);
      } catch (error) {
        console.error('[CrawlingStore] Failed to serialize startConfig:', error);
        configToSend = {};
      }
    } else {
      // this.config에서 실제 config 부분만 추출
      try {
        const currentConfig = this.config as any;
        if (currentConfig && typeof currentConfig === 'object') {
          if (currentConfig.config) {
            configToSend = this.extractSerializableConfig(currentConfig.config);
          } else if (currentConfig.success && currentConfig.config) {
            configToSend = this.extractSerializableConfig(currentConfig.config);
          } else {
            configToSend = this.extractSerializableConfig(currentConfig);
          }
        }
      } catch (error) {
        console.error('[CrawlingStore] Failed to serialize config:', error);
        configToSend = {};
      }
    }
    
    console.log('[CrawlingStore] Sending config to IPC:', JSON.stringify(configToSend));
    
    return this.ipcServiceInstance.startCrawling(configToSend);
  }

  @action
  public stopCrawling(): Promise<boolean> {
    console.log('[CrawlingStore] Attempting to stop crawling...');
    this.explicitlyStopped = true; // 명시적 중단 플래그 설정
    this.isStopping = true; // 중지 중 상태 설정
    this.status = 'idle';
    
    // 구독 해제 방지: 활성 크롤링 중에는 구독을 유지
    console.log('[CrawlingStore] Explicit stop - maintaining subscriptions for proper cleanup');
    
    // 만약 중지 이벤트가 3초 이내에 오지 않으면 강제로 상태 해제
    setTimeout(() => {
      if (this.isStopping) {
        console.log('[CrawlingStore] 🔄 Timeout: Forcing isStopping to false after 3 seconds');
        runInAction(() => {
          this.isStopping = false;
        });
      }
    }, 3000);
    
    return this.ipcServiceInstance.stopCrawling();
  }

  @action
  public async checkStatus(): Promise<void> {
    console.log('[CrawlingStore] Checking status...');
    this.isCheckingStatus = true;
    try {
      const summary = await this.ipcServiceInstance.checkCrawlingStatus();
      if (summary) {
        runInAction(() => {
            this.handleCrawlingStatusSummary(summary as CrawlingStatusSummary);
        });
      }
    } catch (err) {
      console.error('[CrawlingStore] Error checking status:', err);
      runInAction(() => {
        this.error = { message: ' 상태 확인 실패', name: 'StatusCheckError' };
      });
    } finally {
      runInAction(() => {
        this.isCheckingStatus = false;
      });
    }
  }

  @action
  public updateProgress(progressUpdate: Partial<CrawlingProgress>): void {
    console.log('[CrawlingStore] Manual progress update:', JSON.stringify(progressUpdate));
    this.progress = { ...this.progress, ...progressUpdate };
  }

  @action
  public clearError(): void {
    this.error = null;
  }

  @action
  public setConfig(newConfig: CrawlerConfig): void {
    this.config = { ...this.config, ...newConfig };
  }

  @action
  public async loadConfig(): Promise<CrawlerConfig> {
    try {
      const config = await this.ipcServiceInstance.getConfig();
      runInAction(() => {
        this.config = config || {} as CrawlerConfig;
      });
      return this.config;
    } catch (err) {
      console.error('[CrawlingStore] Error loading config:', err);
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
      console.error('[CrawlingStore] Error updating config:', err);
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
    console.log('[CrawlingStore] Cleaning up subscriptions');
    
    // 활성 크롤링 중에는 구독 해제를 지연
    if (this.isRunning && !this.explicitlyStopped) {
      console.log('[CrawlingStore] Delaying cleanup - crawling is active');
      return;
    }
    
    console.log('[CrawlingStore] Proceeding with cleanup');
    this.unsubscribeCrawlingProgress?.();
    this.unsubscribeCrawlingComplete?.();
    this.unsubscribeCrawlingError?.();
    this.unsubscribeCrawlingStopped?.();
    this.unsubscribeCrawlingStatusSummary?.();
    this.unsubscribeCrawlingTaskStatus?.();
    this.unsubscribeEventBus?.();
    
    // 상태 초기화
    this.progress = { ...initialProgress };
    this.status = 'idle';
    this.error = null;
    this.currentMessage = '대기 중...';
    this.explicitlyStopped = false;
    this.isStopping = false; // 중지 중 상태도 리셋
    this.isStopping = false; // 중지 중 상태도 리셋
    this.highestStageReached = 0;
    
    // CrawlingProgressViewModel 정리
    crawlingProgressViewModel.reset();
  }

  /**
   * 강제 정리 - 앱 종료 시 사용
   */
  @action
  public forceCleanup(): void {
    console.log('[CrawlingStore] Force cleaning up all subscriptions');
    this.unsubscribeCrawlingProgress?.();
    this.unsubscribeCrawlingComplete?.();
    this.unsubscribeCrawlingError?.();
    this.unsubscribeCrawlingStopped?.();
    this.unsubscribeCrawlingStatusSummary?.();
    this.unsubscribeCrawlingTaskStatus?.();
    this.unsubscribeEventBus?.();
    this.progress = { ...initialProgress };
    this.status = 'idle';
    this.error = null;
    this.currentMessage = '대기 중...';
  }
}

console.log('[CrawlingStore] 🏭 Creating singleton CrawlingStore instance...');
export const crawlingStore = new CrawlingStore(ipcService);
console.log('[CrawlingStore] 🏭 Singleton CrawlingStore instance created successfully');
