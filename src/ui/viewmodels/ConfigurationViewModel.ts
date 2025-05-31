/**
 * ConfigurationViewModel.ts
 * 크롤링 설정 관리를 위한 ViewModel
 * 
 * 책임:
 * - 설정 로드/저장/검증
 * - 설정 변경사항 추적
 * - 기본값 및 유효성 검사
 * - SessionConfigManager 통합
 */

import { BaseViewModel } from './core/BaseViewModel';
import { makeObservable, observable, action, computed } from 'mobx';
import { crawlingStore } from '../stores/domain/CrawlingStore';
import { logStore } from '../stores/domain/LogStore';
import { SessionConfigManager } from '../services/domain/SessionConfigManager';
import type { CrawlerConfig } from '../../../types';

/**
 * 설정 변경 상태 인터페이스
 */
export interface ConfigurationState {
  config: CrawlerConfig;
  originalConfig: CrawlerConfig;
  hasChanges: boolean;
  isLoading: boolean;
  isSaving: boolean;
  validationErrors: Record<string, string>;
  lastSaved: Date | null;
  error: string | null;
}

/**
 * 설정 유효성 검사 결과
 */
export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  warnings: Record<string, string>;
}

/**
 * 설정 관리 ViewModel
 * SessionConfigManager와 CrawlingStore를 통합하여 설정 관리
 */
export class ConfigurationViewModel extends BaseViewModel {
  // === Observable State ===
  @observable accessor config: CrawlerConfig = {} as CrawlerConfig;
  @observable accessor originalConfig: CrawlerConfig = {} as CrawlerConfig;
  @observable accessor isLoading: boolean = false;
  @observable accessor isSaving: boolean = false;
  @observable accessor validationErrors: Record<string, string> = {};
  @observable accessor lastSaved: Date | null = null;
  @observable accessor error: string | null = null;
  @observable accessor isConfigurationLocked: boolean = false;

  // === Service Dependencies ===
  private sessionConfigManager = SessionConfigManager.getInstance();
  private crawlingStore = crawlingStore;
  private logStore = logStore;

  constructor() {
    super();
    makeObservable(this);
    this.initialize();
  }

  // === Computed Properties ===
  @computed get configurationState(): ConfigurationState {
    return {
      config: this.config,
      originalConfig: this.originalConfig,
      hasChanges: this.hasChanges,
      isLoading: this.isLoading,
      isSaving: this.isSaving,
      validationErrors: this.validationErrors,
      lastSaved: this.lastSaved,
      error: this.error
    };
  }

  @computed get hasChanges(): boolean {
    return JSON.stringify(this.config) !== JSON.stringify(this.originalConfig);
  }

  @computed get isValid(): boolean {
    return Object.keys(this.validationErrors).length === 0;
  }

  @computed get canSave(): boolean {
    return this.hasChanges && this.isValid && !this.isSaving;
  }

  @computed get canReset(): boolean {
    return this.hasChanges && !this.isSaving;
  }

  @computed get isDirty(): boolean {
    return this.hasChanges;
  }

  // === Initialization ===
  @action
  async initialize(): Promise<void> {
    try {
      await this.loadConfiguration();
      this.logDebug('initialize', 'ConfigurationViewModel initialized successfully');
    } catch (error) {
      this.error = `Initialization failed: ${error}`;
      this.logError('initialize', error);
    }
  }

  // === Configuration Locking ===
  @action
  setConfigurationLocked(locked: boolean): void {
    this.isConfigurationLocked = locked;
    this.logDebug('setConfigurationLocked', `Configuration lock set to: ${locked}`);
  }

  // === Configuration Field Updates ===
  @action
  updateConfigurationField<K extends keyof CrawlerConfig>(
    field: K,
    value: CrawlerConfig[K]
  ): void {
    this.updateConfig(field, value);
  }

  // === Discard Changes ===
  @action
  discardChanges(): void {
    this.resetConfiguration();
  }

  // === Get Effective Value (for compatibility with SessionConfigManager interface) ===
  getEffectiveValue<K extends keyof CrawlerConfig>(key: K): CrawlerConfig[K] | undefined {
    return this.config[key];
  }

  // === Clear Error ===
  @action
  clearErrorState(): void {
    this.clearError();
  }

  // === Save Config (wrapper for saveConfiguration) ===
  @action
  async saveConfig(config?: CrawlerConfig): Promise<void> {
    if (config) {
      this.config = { ...config };
    }
    await this.saveConfiguration();
  }

  // === Session Status for Debugging ===
  getSessionStatus() {
    return {
      isConfigLoaded: Object.keys(this.config).length > 0,
      isLocked: this.isConfigurationLocked,
      isDirty: this.isDirty,
      hasChanges: this.hasChanges,
      lastSaved: this.lastSaved,
      isLoading: this.isLoading,
      isSaving: this.isSaving,
      error: this.error,
      validationErrors: this.validationErrors
    };
  }

  // === Configuration Loading ===
  
  /**
   * 설정 로드
   */
  @action
  async loadConfiguration(): Promise<void> {
    if (this.isLoading) return;

    this.isLoading = true;
    this.clearError();

    try {
      // CrawlingStore에서 현재 설정 로드
      const loadedConfig = await this.crawlingStore.loadConfig();
      
      this.config = { ...loadedConfig };
      this.originalConfig = { ...loadedConfig };
      
      // 유효성 검사
      this.validateConfiguration();
      
      this.addLog('Configuration loaded successfully', 'success');
      
    } catch (error) {
      this.error = `Failed to load configuration: ${error}`;
      this.logError('loadConfiguration', error);
      this.addLog('Failed to load configuration', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * 설정 새로고침
   */
  @action
  async refreshConfiguration(): Promise<void> {
    await this.loadConfiguration();
  }

  // === Configuration Saving ===
  
  /**
   * 설정 저장
   */
  @action
  async saveConfiguration(): Promise<void> {
    if (!this.canSave) {
      throw new Error('Cannot save configuration in current state');
    }

    this.isSaving = true;
    this.clearError();

    try {
      // 유효성 검사
      const validation = this.validateConfiguration();
      if (!validation.isValid) {
        throw new Error('Configuration validation failed');
      }

      // CrawlingStore를 통해 설정 업데이트
      await this.crawlingStore.updateConfig(this.config);
      
      // SessionConfigManager를 통해 세션 설정 저장
      await this.sessionConfigManager.savePendingChanges();
      
      // 원본 설정 업데이트
      this.originalConfig = { ...this.config };
      this.lastSaved = new Date();
      
      this.addLog('Configuration saved successfully', 'success');
      
    } catch (error) {
      this.error = `Failed to save configuration: ${error}`;
      this.logError('saveConfiguration', error);
      this.addLog('Failed to save configuration', 'error');
      throw error;
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * 자동 저장 (변경사항이 있을 때)
   */
  @action
  async autoSave(): Promise<void> {
    if (this.hasChanges && this.isValid) {
      try {
        await this.saveConfiguration();
      } catch (error) {
        // 자동 저장 실패는 로그만 남기고 에러를 던지지 않음
        this.logError('autoSave', error);
      }
    }
  }

  // === Configuration Modification ===
  
  /**
   * 설정 값 업데이트
   */
  @action
  updateConfig<K extends keyof CrawlerConfig>(
    key: K, 
    value: CrawlerConfig[K]
  ): void {
    this.config = {
      ...this.config,
      [key]: value
    };
    
    // 해당 필드 유효성 검사
    this.validateField(key, value);
    
    this.logDebug('updateConfig', `Updated ${key}`, { key, value });
  }

  /**
   * 여러 설정 값 일괄 업데이트
   */
  @action
  updateMultipleConfig(updates: Partial<CrawlerConfig>): void {
    this.config = {
      ...this.config,
      ...updates
    };
    
    // 전체 유효성 검사
    this.validateConfiguration();
    
    this.logDebug('updateMultipleConfig', 'Updated multiple config values', updates);
  }

  /**
   * 설정 초기화 (원본으로 되돌리기)
   */
  @action
  resetConfiguration(): void {
    this.config = { ...this.originalConfig };
    this.validationErrors = {};
    this.clearError();
    
    this.addLog('Configuration reset to last saved state', 'info');
  }

  /**
   * 기본값으로 초기화
   */
  @action
  resetToDefaults(): void {
    this.config = this.getDefaultConfiguration();
    this.validateConfiguration();
    this.clearError();
    
    this.addLog('Configuration reset to default values', 'info');
  }

  // === Validation ===
  
  /**
   * 전체 설정 유효성 검사
   */
  @action
  validateConfiguration(): ValidationResult {
    const errors: Record<string, string> = {};
    const warnings: Record<string, string> = {};

    // 페이지 범위 제한 검증
    if (this.config.pageRangeLimit <= 0) {
      errors.pageRangeLimit = 'Page range limit must be greater than 0';
    }
    if (this.config.pageRangeLimit > 1000) {
      warnings.pageRangeLimit = 'Large page range may take a long time';
    }

    // 재시도 횟수 검증
    if (this.config.productListRetryCount < 1) {
      errors.productListRetryCount = 'Retry count must be at least 1';
    }
    if (this.config.productDetailRetryCount < 1) {
      errors.productDetailRetryCount = 'Retry count must be at least 1';
    }

    // 동시성 설정 검증
    if (this.config?.initialConcurrency !== undefined && this.config.initialConcurrency <= 0) {
      errors.initialConcurrency = 'Initial concurrency must be greater than 0';
    }
    if (this.config?.detailConcurrency !== undefined && this.config.detailConcurrency <= 0) {
      errors.detailConcurrency = 'Detail concurrency must be greater than 0';
    }

    // 타임아웃 설정 검증
    if (this.config?.pageTimeoutMs !== undefined && this.config.pageTimeoutMs < 1000) {
      errors.pageTimeoutMs = 'Page timeout must be at least 1000ms';
    }
    if (this.config?.productDetailTimeoutMs !== undefined && this.config.productDetailTimeoutMs < 1000) {
      errors.productDetailTimeoutMs = 'Product detail timeout must be at least 1000ms';
    }

    // URL 검증
    if (this.config?.baseUrl && !this.isValidUrl(this.config.baseUrl)) {
      errors.baseUrl = 'Base URL is not valid';
    }
    if (this.config?.matterFilterUrl && !this.isValidUrl(this.config.matterFilterUrl)) {
      errors.matterFilterUrl = 'Matter filter URL is not valid';
    }

    // 배치 설정 검증
    if (this.config?.enableBatchProcessing) {
      if (this.config?.batchSize !== undefined && this.config.batchSize <= 0) {
        errors.batchSize = 'Batch size must be greater than 0';
      }
      if (this.config?.batchDelayMs !== undefined && this.config.batchDelayMs < 0) {
        errors.batchDelayMs = 'Batch delay cannot be negative';
      }
    }

    this.validationErrors = errors;

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      warnings
    };
  }

  /**
   * 특정 필드 유효성 검사
   */
  @action
  validateField<K extends keyof CrawlerConfig>(
    key: K, 
    value: CrawlerConfig[K]
  ): boolean {
    const errors = { ...this.validationErrors };
    
    // 기존 오류 제거
    delete errors[key as string];
    
    // 필드별 유효성 검사
    switch (key) {
      case 'pageRangeLimit':
        if ((value as number) <= 0) {
          errors[key] = 'Page range limit must be greater than 0';
        }
        break;
      case 'baseUrl':
      case 'matterFilterUrl':
        if (!this.isValidUrl(value as string)) {
          errors[key] = 'URL is not valid';
        }
        break;
      // 필요에 따라 다른 필드 검증 추가
    }
    
    this.validationErrors = errors;
    return !errors[key as string];
  }

  // === Utility Methods ===
  
  /**
   * URL 유효성 검사
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 기본 설정 반환
   */
  private getDefaultConfiguration(): CrawlerConfig {
    return {
      pageRangeLimit: 5,
      productListRetryCount: 3,
      productDetailRetryCount: 5,
      productsPerPage: 12,
      autoAddToLocalDB: true,
      crawlerType: 'axios',
      batchSize: 50,
      batchDelayMs: 1000,
      enableBatchProcessing: true,
      batchRetryLimit: 3,
      baseUrl: 'https://csa-iot.org/csa-iot_products/',
      matterFilterUrl: 'https://csa-iot.org/csa-iot_products/?p_keywords=&p_type%5B%5D=14&p_program_type%5B%5D=1049&p_certificate=&p_family=&p_firmware_ver=',
      pageTimeoutMs: 30000,
      productDetailTimeoutMs: 30000,
      initialConcurrency: 10,
      detailConcurrency: 10,
      retryConcurrency: 5,
      minRequestDelayMs: 100,
      maxRequestDelayMs: 2000,
      retryStart: 1,
      retryMax: 5,
      cacheTtlMs: 300000,
      headlessBrowser: true,
      maxConcurrentTasks: 10,
      requestDelay: 100
    };
  }

  @action
  clearError(): void {
    this.error = null;
  }

  private addLog(message: string, type: 'info' | 'success' | 'warning' | 'error'): void {
    this.logStore.addLog(message, type);
  }

  // === Public API ===

  /**
   * 현재 설정 상태 반환
   */
  getConfigurationState(): ConfigurationState {
    return this.configurationState;
  }

  /**
   * 특정 설정 값 반환
   */
  getConfigValue<K extends keyof CrawlerConfig>(key: K): CrawlerConfig[K] {
    return this.config[key];
  }

  /**
   * 유효성 검사 결과 반환
   */
  getValidationResult(): ValidationResult {
    return this.validateConfiguration();
  }

  /**
   * 설정 내보내기 (JSON)
   */
  exportConfiguration(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * 설정 가져오기 (JSON)
   */
  @action
  importConfiguration(configJson: string): void {
    try {
      const importedConfig = JSON.parse(configJson) as CrawlerConfig;
      this.config = { ...this.getDefaultConfiguration(), ...importedConfig };
      this.validateConfiguration();
      this.addLog('Configuration imported successfully', 'success');
    } catch (error) {
      this.error = `Failed to import configuration: ${error}`;
      this.addLog('Failed to import configuration', 'error');
      throw error;
    }
  }

  /**
   * 리소스 정리
   */
  cleanup(): void {
    this.logDebug('cleanup', 'ConfigurationViewModel cleanup completed');
  }
}
