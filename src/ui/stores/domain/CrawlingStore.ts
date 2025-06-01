/**
 * CrawlingStore.ts
 * MobX-based Domain Store for Crawling Operations
 * 
 * Manages all crawling-related state including progress, status, configuration,
 * and crawling operations. Encapsulates crawling business logic.
 */

import { makeObservable, observable, action, runInAction } from 'mobx';
import { IPCService, IPCUnsubscribeFunction, ipcService } from '../../services/IPCService'; // Added ipcService import

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

  private unsubscribeCrawlingProgress: IPCUnsubscribeFunction | null = null;
  private unsubscribeCrawlingComplete: IPCUnsubscribeFunction | null = null;
  private unsubscribeCrawlingError: IPCUnsubscribeFunction | null = null;
  private unsubscribeCrawlingStopped: IPCUnsubscribeFunction | null = null;
  private unsubscribeCrawlingStatusSummary: IPCUnsubscribeFunction | null = null;

  constructor(private ipcServiceInstance: IPCService) {
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
    this.subscribeToEvents();
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
    console.log('[CrawlingStore] Subscribing to IPC events');
    this.unsubscribeCrawlingProgress = this.ipcServiceInstance.subscribeCrawlingProgress(
      this.handleCrawlingProgress
    );
    this.unsubscribeCrawlingComplete = this.ipcServiceInstance.subscribeCrawlingComplete(
      this.handleCrawlingComplete
    );
    this.unsubscribeCrawlingError = this.ipcServiceInstance.subscribeCrawlingError(
      this.handleCrawlingError
    );
    this.unsubscribeCrawlingStopped = this.ipcServiceInstance.subscribeCrawlingStopped(
      this.handleCrawlingStopped
    );
    this.unsubscribeCrawlingStatusSummary = this.ipcServiceInstance.subscribeCrawlingStatusSummary(
      this.handleCrawlingStatusSummary
    );
  }

  @action
  private handleCrawlingProgress = (progress: CrawlingProgress): void => {
    console.log('[CrawlingStore] handleCrawlingProgress invoked. Data:', JSON.stringify(progress));
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
      console.log('[CrawlingStore] Progress updated in store. New currentStage:', this.progress.currentStage, 'New currentStep:', this.progress.currentStep);
    });
  };

  @action
  private handleCrawlingComplete = (data: any): void => {
    console.log('[CrawlingStore] Crawling complete:', data);
    runInAction(() => {
      this.status = 'completed';
      this.progress = {
        ...this.progress,
        status: 'completed',
        percentage: 100,
        currentStep: '크롤링 완료',
        message: data?.message || '크롤링이 성공적으로 완료되었습니다.'
      };
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
    console.log('[CrawlingStore] Crawling stopped:', data);
    runInAction(() => {
      this.status = 'idle';
      this.progress = {
        ...this.progress,
        status: 'idle',
        currentStep: '크롤링 중단됨',
        message: data?.message || '크롤링이 중단되었습니다.'
      };
    });
  };

  @action
  private handleCrawlingStatusSummary = (summary: CrawlingStatusSummary): void => {
    console.log('[CrawlingStore] Crawling status summary received:', JSON.stringify(summary));
    runInAction(() => {
      this.lastStatusSummary = this.statusSummary ? { ...this.statusSummary } : null;
      this.statusSummary = summary;
    });
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
    this.status = 'initializing';
    this.progress = { ...initialProgress, status: 'initializing', currentStep: '크롤링 시작 중...', startTime: Date.now() }; 
    
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
    this.status = 'idle';
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
    this.unsubscribeCrawlingProgress?.();
    this.unsubscribeCrawlingComplete?.();
    this.unsubscribeCrawlingError?.();
    this.unsubscribeCrawlingStopped?.();
    this.unsubscribeCrawlingStatusSummary?.();
    this.progress = { ...initialProgress };
    this.status = 'idle';
    this.error = null;
    this.currentMessage = '대기 중...';
  }
}

export const crawlingStore = new CrawlingStore(ipcService);
