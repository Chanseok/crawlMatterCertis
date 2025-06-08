/**
 * CrawlingService.ts
 * 크롤링 관련 비즈니스 로직을 담당하는 서비스
 * 
 * Phase 3: Service Layer Refactoring
 * - Enhanced with standardized event subscription patterns
 * - Integrated resilience management for crawling operations
 * - Improved service lifecycle management
 * 
 * 크롤링 시작/중지, 상태 체크, 설정 관리 등을 추상화
 */

import { BaseService, ServiceResult } from '../base/BaseService';
import type { CrawlingStatus } from '../../../shared/types';
import type { 
  CrawlerConfig,
  CrawlingProgress 
} from '../../../../types';
import type { CrawlingSummary } from '../../../electron/crawler/utils/types';

export interface CrawlingStartParams {
  config?: Partial<CrawlerConfig>;
  mode?: string;
}

export interface CrawlingStatusResult {
  status: CrawlingStatus;
  progress?: CrawlingProgress;
  summary?: CrawlingSummary;
}

export interface CrawlingConfigUpdateParams {
  config: Partial<CrawlerConfig>;
  applyImmediately?: boolean;
}

/**
 * 크롤링 서비스 클래스
 * 모든 크롤링 관련 작업을 추상화하여 제공
 * 
 * Phase 3 Enhanced Features:
 * - Standardized event subscription management
 * - Resilience patterns for crawling operations
 * - Improved error handling and recovery
 */
export class CrawlingService extends BaseService {
  private static instance: CrawlingService | null = null;
  private currentConfig: CrawlerConfig | null = null;

  constructor() {
    super('CrawlingService');
    // Initialize resilience patterns for API-like operations
    this.initializeResilience({ 
      serviceType: 'api',
      enableCircuitBreaker: true,
      enableRetry: true 
    });
  }

  /**
   * Get singleton instance of CrawlingService
   */
  public static getInstance(): CrawlingService {
    if (!CrawlingService.instance) {
      CrawlingService.instance = new CrawlingService();
    }
    return CrawlingService.instance;
  }

  /**
   * 크롤링 시작
   */
  async startCrawling(params: CrawlingStartParams = {}): Promise<ServiceResult<boolean>> {
    const { config, mode } = params;

    return this.executeOperation(async () => {
      if (!this.isIPCAvailable()) {
        throw new Error('IPC not available');
      }

      // 현재 설정과 새로운 설정 병합
      const finalConfig = this.mergeConfig(config);
      this.currentConfig = finalConfig;

      const startParams = {
        config: finalConfig,
        ...(mode && { mode })
      };

      const result = await this.ipcService.call<boolean>('startCrawling', startParams);
      
      if (typeof result !== 'boolean') {
        throw new Error('Invalid response from crawling start');
      }

      return result;
    }, 'startCrawling');
  }

  /**
   * 크롤링 중지
   */
  async stopCrawling(): Promise<ServiceResult<boolean>> {
    return this.executeOperation(async () => {
      if (!this.isIPCAvailable()) {
        throw new Error('IPC not available');
      }

      const result = await this.ipcService.call<boolean>('stopCrawling');
      
      if (typeof result !== 'boolean') {
        throw new Error('Invalid response from crawling stop');
      }

      return result;
    }, 'stopCrawling');
  }

  /**
   * 크롤링 상태 체크
   */
  async checkCrawlingStatus(): Promise<ServiceResult<CrawlingStatusResult>> {
    return this.executeOperation(async () => {
      if (!this.isIPCAvailable()) {
        throw new Error('IPC not available');
      }

      const result = await this.ipcService.call<any>('checkCrawlingStatus');
      // result: { success: true, status: {...} } or { success: false, error: ... }
      const statusObj = (result && result.success && typeof result.status === 'object' && result.status !== null)
        ? result.status
        : {};

      return {
        status: statusObj.status || 'idle',
        progress: undefined, // checkCrawlingStatus doesn't return progress
        summary: statusObj
      };
    }, 'checkCrawlingStatus');
  }

  /**
   * 현재 크롤링 상태 조회 (단순 상태 반환)
   */
  async getStatus(): Promise<ServiceResult<CrawlingStatusResult>> {
    return this.checkCrawlingStatus();
  }

  /**
   * 크롤링 설정 업데이트
   */
  async updateConfig(params: CrawlingConfigUpdateParams): Promise<ServiceResult<CrawlerConfig>> {
    const { config, applyImmediately = false } = params;

    if (!config || typeof config !== 'object') {
      return this.createFailure(
        this.createError('INVALID_PARAMS', 'Config object is required')
      );
    }

    return this.executeOperation(async () => {
      // 설정 유효성 검사
      this.validateConfig(config);

      // 현재 설정과 병합
      const updatedConfig = this.mergeConfig(config);
      this.currentConfig = updatedConfig;

      // 즉시 적용이 요청된 경우 IPC를 통해 백엔드에 전달
      if (applyImmediately && this.isIPCAvailable()) {
        await this.ipcService.call<void>('updateConfig', updatedConfig);
      }

      return updatedConfig;
    }, 'updateConfig');
  }

  /**
   * 크롤링 설정 조회
   */
  async getConfig(): Promise<ServiceResult<CrawlerConfig>> {
    return this.executeOperation(async () => {
      if (this.currentConfig) {
        return this.currentConfig;
      }

      if (!this.isIPCAvailable()) {
        throw new Error('IPC not available');
      }

      const config = await this.ipcService.call<CrawlerConfig>('getConfig');
      this.currentConfig = config;
      return config;
    }, 'getConfig');
  }

  /**
   * 크롤링 설정 초기화
   */
  async resetConfig(): Promise<ServiceResult<CrawlerConfig>> {
    return this.executeOperation(async () => {
      if (!this.isIPCAvailable()) {
        throw new Error('IPC not available');
      }

      const defaultConfig = await this.ipcService.call<CrawlerConfig>('resetConfig');
      this.currentConfig = defaultConfig;
      return defaultConfig;
    }, 'resetConfig');
  }

  /**
   * 크롤링 진행 상황 구독
   * Enhanced with standardized subscription management
   */
  subscribeCrawlingProgress(callback: (progress: CrawlingProgress) => void): () => void {
    return this.subscribeToEvent(
      'crawlingProgress',
      callback,
      (handler) => this.ipcService.subscribeToCrawlingProgress(handler)
    );
  }  /**
   * 크롤링 완료 구독
   * Enhanced with standardized subscription management
   */
  subscribeCrawlingComplete(callback: (result: { success: boolean; count?: number; autoSavedToDb?: boolean }) => void): () => void {
    return this.subscribeToEvent(
      'crawlingComplete',
      callback,
      (handler) => this.ipcService.subscribeToCrawlingComplete(handler)
    );
  }

  /**
   * 크롤링 에러 구독
   * Enhanced with standardized subscription management
   */
  subscribeCrawlingError(callback: (error: { message: string }) => void): () => void {
    return this.subscribeToEvent(
      'crawlingError',
      callback,
      (handler) => this.ipcService.subscribeToCrawlingError(handler)
    );
  }

  /**
   * 크롤링 상태 요약 구독
   * 사이트 로컬 비교 패널을 위한 정보 수신
   * Enhanced with standardized subscription management
   */
  subscribeCrawlingStatusSummary(callback: (summary: any) => void): () => void {
    return this.subscribeToEvent(
      'crawlingStatusSummary',
      callback,
      (handler) => this.ipcService.subscribeCrawlingStatusSummary(handler)
    );
  }

  /**
   * 크롤링 작업 상태 확인
   */
  async isRunning(): Promise<ServiceResult<boolean>> {
    return this.executeOperation(async () => {
      const statusResult = await this.checkCrawlingStatus();
      if (!statusResult.success) {
        throw new Error('Failed to check crawling status');
      }
      
      // 상태 기반으로 실행 중 여부 판단
      const status = statusResult.data?.status;
      return status === 'running' || status === 'initializing';
    }, 'isRunning');
  }

  /**
   * 설정 유효성 검사
   */
  private validateConfig(config: Partial<CrawlerConfig>): void {
    if (config.pageRangeLimit !== undefined) {
      if (typeof config.pageRangeLimit !== 'number' || config.pageRangeLimit < 1) {
        throw new Error('pageRangeLimit must be a positive number');
      }
    }

    if (config.productsPerPage !== undefined) {
      if (typeof config.productsPerPage !== 'number' || config.productsPerPage < 1) {
        throw new Error('productsPerPage must be a positive number');
      }
    }

    if (config.productListRetryCount !== undefined) {
      if (typeof config.productListRetryCount !== 'number' || config.productListRetryCount < 0) {
        throw new Error('productListRetryCount must be a non-negative number');
      }
    }

    if (config.productDetailRetryCount !== undefined) {
      if (typeof config.productDetailRetryCount !== 'number' || config.productDetailRetryCount < 0) {
        throw new Error('productDetailRetryCount must be a non-negative number');
      }
    }
  }

  /**
   * 설정 병합
   */
  private mergeConfig(newConfig?: Partial<CrawlerConfig>): CrawlerConfig {
    const defaultConfig: CrawlerConfig = {
      pageRangeLimit: 10,
      productListRetryCount: 9,
      productDetailRetryCount: 9,
      productsPerPage: 12,
      autoAddToLocalDB: false,
      autoStatusCheck: true
    };

    return {
      ...defaultConfig,
      ...this.currentConfig,
      ...newConfig
    };
  }

  /**
   * 서비스 정리
   * Enhanced with BaseService.cleanup() for automatic event subscription cleanup
   */
  async cleanup(): Promise<void> {
    this.log('Cleaning up crawling service');
    
    // Clear service-specific state
    this.currentConfig = null;
    
    // Call parent cleanup for automatic event subscription cleanup
    await super.cleanup();
  }
}

// Singleton instance
export const crawlingService = new CrawlingService();
