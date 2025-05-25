/**
 * CrawlingStore.ts
 * Domain Store for Crawling Operations
 * 
 * Manages all crawling-related state including progress, status, configuration,
 * and crawling operations. Encapsulates crawling business logic.
 */

import { atom, map } from 'nanostores';
import type { CrawlingProgress, CrawlingStatus, CrawlerConfig } from '../../../../types';
import type { CrawlingSummary } from '../../../electron/crawler/utils/types';
import { IPCService } from '../../services/IPCService';
import { CrawlingService } from '../../services/domain/CrawlingService';
import { ConfigurationService } from '../../services/domain/ConfigurationService';

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
  public readonly status = atom<CrawlingStatus>('idle');
  public readonly progress = map<CrawlingProgress>({
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
  });

  // Configuration
  public readonly config = map<CrawlerConfig>({
    pageRangeLimit: 10,
    productListRetryCount: 9,
    productDetailRetryCount: 9,
    productsPerPage: 12,
    autoAddToLocalDB: false
  });

  // Status and summary
  public readonly statusSummary = map<CrawlingSummary>({} as CrawlingSummary);
  public readonly lastStatusSummary = map<CrawlingSummary>({} as CrawlingSummary);
  public readonly error = atom<string | null>(null);

  // Event emitters for coordination
  public readonly onProgressUpdate = atom<CrawlingProgress | null>(null);
  public readonly onStatusChange = atom<CrawlingStatus | null>(null);
  public readonly onConfigChange = atom<CrawlerConfig | null>(null);

  private ipcService: IPCService;
  private crawlingService: CrawlingService;
  private configurationService: ConfigurationService; // 추가
  private unsubscribeFunctions: (() => void)[] = [];

  constructor() {
    this.ipcService = IPCService.getInstance();
    this.crawlingService = CrawlingService.getInstance();
    this.configurationService = ConfigurationService.getInstance(); // 추가
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
        ...this.progress.get(),
        ...progress,
        status: validStatus
      };
      
      this.progress.set(updatedProgress);
      this.status.set(validStatus);
      this.onProgressUpdate.set(updatedProgress);
    });
    this.unsubscribeFunctions.push(unsubProgress);

    // Crawling completion
    const unsubComplete = this.ipcService.subscribeCrawlingComplete(
      (result: { success: boolean; count?: number; autoSavedToDb?: boolean }) => {
        if (result.success) {
          this.status.set('completed');
        } else {
          this.status.set('error');
          this.error.set('크롤링이 실패했습니다.');
        }
        this.onStatusChange.set(this.status.get());
      }
    );
    this.unsubscribeFunctions.push(unsubComplete);

    // Crawling errors
    const unsubError = this.ipcService.subscribeCrawlingError((errorData: { message: string }) => {
      this.status.set('error');
      this.error.set(errorData.message || '크롤링 중 오류가 발생했습니다.');
      this.onStatusChange.set('error');
    });
    this.unsubscribeFunctions.push(unsubError);
  }

  /**
   * Start crawling
   */
  async startCrawling(): Promise<void> {
    try {
      this.error.set(null);
      this.status.set('running');
      this.onStatusChange.set('running');

      const config = this.config.get();
      const result = await this.crawlingService.startCrawling({
        config: config
      });

      if (!result.success) {
        this.status.set('error');
        this.error.set(result.error?.message || '크롤링을 시작할 수 없습니다.');
        throw new Error(result.error?.message || '크롤링을 시작할 수 없습니다.');
      }
    } catch (error) {
      this.status.set('error');
      this.error.set(error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.');
      this.onStatusChange.set('error');
      throw error;
    }
  }

  /**
   * Stop crawling
   */
  async stopCrawling(): Promise<void> {
    try {
      const result = await this.crawlingService.stopCrawling();
      
      if (result.success) {
        this.status.set('idle');
        this.error.set(null);
        this.onStatusChange.set('idle');
      } else {
        throw new Error(result.error?.message || '크롤링을 중지할 수 없습니다.');
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : '크롤링 중지에 실패했습니다.');
      throw error;
    }
  }

  /**
   * Check crawling status
   */
  async checkStatus(): Promise<void> {
    try {
      // Save previous status
      const prev = this.statusSummary.get();
      if (prev && Object.keys(prev).length > 0) {
        this.lastStatusSummary.set(prev);
      }

      const status = await this.ipcService.checkCrawlingStatus();

      if (status) {
        this.statusSummary.set(status);
      } else {
        throw new Error('상태 체크 실패');
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : '상태 체크에 실패했습니다.');
      throw error;
    }
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig: Partial<CrawlerConfig>): Promise<void> {
    try {
      console.log('CrawlingStore.updateConfig called with:', newConfig);
      const currentConfig = this.config.get();
      const updatedConfig = { ...currentConfig, ...newConfig };
      
      // 메모리 상태 업데이트
      this.config.set(updatedConfig);
      this.onConfigChange.set(updatedConfig);
      
      // 파일에 저장 (이 부분이 핵심!)
      await this.configurationService.updateConfig(updatedConfig);
      
      console.log('Configuration saved to file:', updatedConfig);
      
    } catch (error) {
      console.error('Failed to update config:', error);
      this.error.set('설정 저장에 실패했습니다.');
      throw error;
    }
  }

  /**
   * Update crawling progress
   */
  updateProgress(progressUpdate: Partial<CrawlingProgress>): void {
    const updatedProgress = { ...progressUpdate };
    
    if (progressUpdate.status) {
      updatedProgress.status = this.validateCrawlingStatus(String(progressUpdate.status));
    }

    const newProgress = {
      ...this.progress.get(),
      ...updatedProgress
    };

    this.progress.set(newProgress);
    this.onProgressUpdate.set(newProgress);

    if (updatedProgress.status) {
      this.status.set(updatedProgress.status);
      this.onStatusChange.set(updatedProgress.status);
    }
  }

  /**
   * Clear error
   */
  clearError(): void {
    this.error.set(null);
  }

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
      status: this.status.get(),
      progress: this.progress.get(),
      config: this.config.get(),
      error: this.error.get(),
      subscriptionsCount: this.unsubscribeFunctions.length
    };
  }

  /**
   * Load configuration
   */
  async loadConfig(): Promise<CrawlerConfig> {
    try {
      console.log('CrawlingStore.loadConfig called');
      const config = await this.configurationService.getConfig();
      console.log('Configuration loaded from file:', config);
      
      // Store 상태에 반영 (이 부분이 핵심!)
      this.config.set(config);
      
      return config;
    } catch (error) {
      console.error('Failed to load config:', error);
      throw error;
    }
  }
}

// Singleton instance
export const crawlingStore = new CrawlingStore();
