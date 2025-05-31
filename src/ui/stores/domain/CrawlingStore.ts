/**
 * CrawlingStore.ts
 * MobX-based Domain Store for Crawling Operations
 * 
 * Manages all crawling-related state including progress, status, configuration,
 * and crawling operations. Encapsulates crawling business logic.
 */

import { makeObservable, observable, action, computed, toJS } from 'mobx';
import type { CrawlingProgress, CrawlingStatus, CrawlerConfig } from '../../../../types';
import type { CrawlingSummary } from '../../../electron/crawler/utils/types';
import { IPCService } from '../../services/IPCService';

export interface CrawlingStatusSummary {
  dbLastUpdated: Date | null;
  dbProductCount: number;
  siteTotalPages: number;
  siteProductCount: number;
  diff: number;
  needCrawling: boolean;
  crawlingRange: { startPage: number; endPage: number };
  actualTargetPageCountForStage1?: number;
}

/**
 * Crawling Domain Store
 * Manages crawling state, progress, configuration, and operations
 */
export class CrawlingStore {
  // Core crawling state
  public status: CrawlingStatus = 'idle';
  public progress: CrawlingProgress = {
    status: 'idle',
    current: 0,
    total: 0,
    percentage: 0,
    currentStep: '',
    elapsedTime: 0,
    currentPage: 0,
    totalPages: 0,
    processedItems: 0,
    totalItems: 0,
    startTime: Date.now(),
    estimatedEndTime: 0,
    newItems: 0,
    updatedItems: 0,
    currentStage: 0,
    message: ''
  };

  // Configuration
  public config: CrawlerConfig = {
    pageRangeLimit: 10,
    productListRetryCount: 9,
    productDetailRetryCount: 9,
    productsPerPage: 12,
    autoAddToLocalDB: false,
    autoStatusCheck: true,    // 기본값: 자동 상태 체크 활성화
    batchSize: 30,
    batchDelayMs: 2000,
    enableBatchProcessing: true,
    batchRetryLimit: 3
  };

  // Status and summary
  public statusSummary: CrawlingSummary = {} as CrawlingSummary;
  public lastStatusSummary: CrawlingSummary = {} as CrawlingSummary;
  public error: string | null = null;

  // Loading states
  public isCheckingStatus: boolean = false;

  private ipcService: IPCService;
  private unsubscribeFunctions: (() => void)[] = [];

  constructor() {
    makeObservable(this, {
      // Observable state
      status: observable,
      progress: observable,
      config: observable,
      statusSummary: observable,
      lastStatusSummary: observable,
      error: observable,
      isCheckingStatus: observable,
      
      // Actions
      setStatus: action,
      setProgress: action,
      setError: action,
      setStatusSummary: action,
      setConfig: action,
      setCheckingStatus: action,
      startCrawling: action,
      stopCrawling: action,
      checkStatus: action,
      updateConfig: action,
      updateProgress: action,
      clearError: action,
      loadConfig: action,
      
      // Computed
      isRunning: computed,
      canStart: computed,
      canStop: computed,
      canPause: computed
    });

    this.ipcService = IPCService.getInstance();
    this.initializeEventSubscriptions();
  }

  /**
   * Initialize IPC event subscriptions
   */
  private initializeEventSubscriptions(): void {
    // Crawling progress updates
    const unsubProgress = this.ipcService.subscribeCrawlingProgress((progress: CrawlingProgress) => {
      const validStatus = this.validateCrawlingStatus(progress.status);
      const updatedProgress = {
        ...this.progress,
        ...progress,
        status: validStatus
      };
      
      this.setProgress(updatedProgress);
      this.setStatus(validStatus);
    });
    this.unsubscribeFunctions.push(unsubProgress);

    // Crawling completion
    const unsubComplete = this.ipcService.subscribeCrawlingComplete(
      (result: { success: boolean; count?: number; autoSavedToDb?: boolean }) => {
        if (result.success) {
          this.setStatus('completed');
        } else {
          this.setStatus('error');
          this.setError('크롤링이 실패했습니다.');
        }
      }
    );
    this.unsubscribeFunctions.push(unsubComplete);

    // Crawling errors
    const unsubError = this.ipcService.subscribeCrawlingError((errorData: { message: string }) => {
      this.setStatus('error');
      this.setError(errorData.message || '크롤링 중 오류가 발생했습니다.');
    });
    this.unsubscribeFunctions.push(unsubError);

    // Crawling stopped
    const unsubStopped = this.ipcService.subscribeCrawlingStopped(() => {
      this.setStatus('idle');
    });
    this.unsubscribeFunctions.push(unsubStopped);

    // Crawling status summary (for 사이트 로컬 비교 panel)
    console.log('[CrawlingStore] Setting up crawlingStatusSummary subscription...');
    const unsubStatusSummary = this.ipcService.subscribeCrawlingStatusSummary((statusSummary: any) => {
      console.log('[CrawlingStore] ✅ Received status summary event!', statusSummary);
      console.log('[CrawlingStore] Status summary type:', typeof statusSummary);
      console.log('[CrawlingStore] Status summary keys:', Object.keys(statusSummary || {}));
      console.log('[CrawlingStore] About to call setStatusSummary...');
      this.setStatusSummary(statusSummary);
      console.log('[CrawlingStore] setStatusSummary call completed');
    });
    this.unsubscribeFunctions.push(unsubStatusSummary);
    console.log('[CrawlingStore] crawlingStatusSummary subscription set up successfully');
  }

  // Action methods
  setStatus = (status: CrawlingStatus) => {
    this.status = status;
  };

  setProgress = (progress: CrawlingProgress) => {
    this.progress = progress;
  };

  setError = (error: string | null) => {
    this.error = error;
  };

  setStatusSummary = (summary: CrawlingSummary) => {
    console.log('[CrawlingStore] 🔄 setStatusSummary() called with:', summary);
    console.log('[CrawlingStore] Summary type:', typeof summary);
    console.log('[CrawlingStore] Summary keys:', summary ? Object.keys(summary) : 'null/undefined');
    
    // Store previous summary
    if (this.statusSummary && Object.keys(this.statusSummary).length > 0) {
      this.lastStatusSummary = this.statusSummary;
      console.log('[CrawlingStore] Previous statusSummary moved to lastStatusSummary:', this.lastStatusSummary);
    }
    
    console.log('[CrawlingStore] Before assignment - this.statusSummary:', this.statusSummary);
    this.statusSummary = summary;
    console.log('[CrawlingStore] After assignment - this.statusSummary:', this.statusSummary);
    console.log('[CrawlingStore] 🔍 Assigned summary properties:');
    console.log('[CrawlingStore] - dbProductCount:', this.statusSummary?.dbProductCount);
    console.log('[CrawlingStore] - siteProductCount:', this.statusSummary?.siteProductCount);
    console.log('[CrawlingStore] - diff:', this.statusSummary?.diff);
    console.log('[CrawlingStore] - needCrawling:', this.statusSummary?.needCrawling);
    console.log('[CrawlingStore] ✅ setStatusSummary() completed');
  };

  setConfig = (config: CrawlerConfig) => {
    this.config = config;
  };

  setCheckingStatus = (isChecking: boolean) => {
    this.isCheckingStatus = isChecking;
  };

  clearError = () => {
    this.error = null;
  };

  updateProgress = (progressUpdate: Partial<CrawlingProgress>) => {
    this.progress = { ...this.progress, ...progressUpdate };
    if (progressUpdate.status) {
      this.status = progressUpdate.status;
    }
  };

  // Computed properties
  get isRunning() {
    return this.status === 'running' || this.status === 'paused';
  }

  get canStart() {
    return this.status === 'idle' || this.status === 'completed' || this.status === 'error';
  }

  get canStop() {
    return this.status === 'running' || this.status === 'paused';
  }

  get canPause() {
    return false; // Pause/resume functionality not implemented
  }

  /**
   * Start crawling
   */
  async startCrawling(): Promise<void> {
    try {
      this.clearError();
      this.setStatus('running');

      // 직렬화 가능한 깔끔한 config 객체 생성
      const serializedConfig = {
        pageRangeLimit: this.config.pageRangeLimit,
        productListRetryCount: this.config.productListRetryCount,
        productDetailRetryCount: this.config.productDetailRetryCount,
        productsPerPage: this.config.productsPerPage,
        autoAddToLocalDB: this.config.autoAddToLocalDB,
        // Batch processing configuration
        batchSize: this.config.batchSize,
        batchDelayMs: this.config.batchDelayMs,
        enableBatchProcessing: this.config.enableBatchProcessing,
        batchRetryLimit: this.config.batchRetryLimit
      };

      const success = await this.ipcService.startCrawling(serializedConfig);

      if (!success) {
        this.setStatus('error');
        this.setError('크롤링을 시작할 수 없습니다.');
        throw new Error('크롤링을 시작할 수 없습니다.');
      }
    } catch (error) {
      this.setStatus('error');
      this.setError(error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.');
      throw error;
    }
  }

  /**
   * Stop crawling
   */
  async stopCrawling(): Promise<void> {
    try {
      const success = await this.ipcService.stopCrawling();
      
      if (success) {
        this.setStatus('idle');
        this.clearError();
      } else {
        throw new Error('크롤링을 중지할 수 없습니다.');
      }
    } catch (error) {
      this.setError(error instanceof Error ? error.message : '크롤링 중지에 실패했습니다.');
      throw error;
    }
  }

  /**
   * Check crawling status
   */
  async checkStatus(): Promise<void> {
    try {
      console.log('[CrawlingStore] 🔍 checkStatus() called - starting status check...');
      this.setCheckingStatus(true);
      
      // Save previous status
      if (this.statusSummary && Object.keys(this.statusSummary).length > 0) {
        this.lastStatusSummary = this.statusSummary;
        console.log('[CrawlingStore] Previous status saved:', this.lastStatusSummary);
      }

      console.log('[CrawlingStore] 📡 Calling ipcService.checkCrawlingStatus()...');
      const status = await this.ipcService.checkCrawlingStatus();
      console.log('[CrawlingStore] 📨 Received status from IPC:', status);
      console.log('[CrawlingStore] Status type:', typeof status);
      console.log('[CrawlingStore] Status keys:', status ? Object.keys(status) : 'null/undefined');

      if (status) {
        console.log('[CrawlingStore] ✅ Setting status summary via setStatusSummary()...');
        console.log('[CrawlingStore] Before setStatusSummary - current statusSummary:', this.statusSummary);
        this.setStatusSummary(status);
        console.log('[CrawlingStore] After setStatusSummary - new statusSummary:', this.statusSummary);
        console.log('[CrawlingStore] 🎯 Status summary update completed!');
      } else {
        console.log('[CrawlingStore] ❌ No status received from IPC');
        throw new Error('상태 체크 실패');
      }
    } catch (error) {
      console.error('[CrawlingStore] 💥 Error in checkStatus():', error);
      this.setError(error instanceof Error ? error.message : '상태 체크에 실패했습니다.');
      throw error;
    } finally {
      console.log('[CrawlingStore] 🏁 checkStatus() completed, setting isCheckingStatus to false');
      this.setCheckingStatus(false);
    }
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig: Partial<CrawlerConfig>): Promise<void> {
    try {
      console.log('CrawlingStore.updateConfig called with:', newConfig);
      const updatedConfig = { ...this.config, ...newConfig };
      console.log('CrawlingStore.updateConfig merged config:', updatedConfig);
      
      // Update memory state
      this.setConfig(updatedConfig);
      console.log('CrawlingStore memory state updated');
      
      // Save to configuration service (if available)
      try {
        console.log('CrawlingStore attempting to save config to file');
        // Convert MobX observable to plain object before IPC transmission
        const plainConfig = toJS(updatedConfig);
        console.log('CrawlingStore plainConfig for IPC:', plainConfig);
        const result = await this.ipcService.updateConfig(plainConfig);
        console.log('Configuration saved to file result:', result);
        
        // Verify the saved config matches what we sent
        if (result.success && result.config) {
          console.log('Saved config from response:', result.config);
          // Update memory state again with the config from the main process
          this.setConfig(result.config);
        } else {
          console.warn('Config save response indicates failure:', result);
        }
      } catch (saveError) {
        console.warn('Failed to save config to file, but memory state updated:', saveError);
      }
      
    } catch (error) {
      console.error('Failed to update config:', error);
      this.setError('설정 저장에 실패했습니다.');
      throw error;
    }
  }

  /**
   * Load configuration
   */
  loadConfig = async (): Promise<CrawlerConfig> => {
    try {
      console.log('CrawlingStore.loadConfig called');
      
      // Check if IPC service is available
      if (!this.ipcService) {
        console.error('IPC service is not available');
        throw new Error('IPC service is not available');
      }
      
      // Attempt to get the configuration
      console.log('Calling this.ipcService.getConfig()');
      const result = await this.ipcService.getConfig();
      console.log('Raw response from getConfig:', result);
      
      // Check if we have a proper config object
      let config: CrawlerConfig;
      if (result && typeof result === 'object') {
        if (result.success && result.config) {
          // Standard success response format
          config = result.config;
        } else if (Object.prototype.hasOwnProperty.call(result, 'pageRangeLimit')) {
          // Direct config object (not wrapped)
          config = result as unknown as CrawlerConfig;
        } else {
          console.error('Invalid config format received:', result);
          throw new Error('Invalid configuration format received');
        }
      } else {
        console.error('Invalid response received:', result);
        throw new Error('Invalid response received from configuration service');
      }
      
      console.log('Configuration loaded from file:', config);
      
      // Update store state
      this.setConfig(config);
      
      return config;
    } catch (error) {
      console.error('Failed to load config:', error);
      throw error;
    }
  };

  /**
   * Validate crawling status
   */
  private validateCrawlingStatus(status: string | undefined): CrawlingStatus {
    if (!status) return 'idle';
    
    const validStatuses: CrawlingStatus[] = [
      'idle', 'running', 'paused', 'completed', 'error', 'initializing', 'stopped', 'completed_stage_1'
    ];
    
    return validStatuses.includes(status as CrawlingStatus) 
      ? (status as CrawlingStatus) 
      : 'running';
  }

  /**
   * Cleanup subscriptions
   */
  async cleanup(): Promise<void> {
    this.unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    this.unsubscribeFunctions = [];
  }

  /**
   * Debug information
   */
  getDebugInfo(): object {
    return {
      status: this.status,
      progress: this.progress,
      config: this.config,
      error: this.error,
      isCheckingStatus: this.isCheckingStatus,
      subscriptionsCount: this.unsubscribeFunctions.length
    };
  }
}

// Singleton instance
export const crawlingStore = new CrawlingStore();
