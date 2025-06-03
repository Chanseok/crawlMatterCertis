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
import { makeObservable, observable, action, computed, runInAction, observable as mobxObservable } from 'mobx';
import { crawlingStore } from '../stores/domain/CrawlingStore';
import { logStore } from '../stores/domain/LogStore';
import { SessionConfigManager } from '../services/domain/SessionConfigManager';
import { Logger, LogLevel } from '../../shared/utils/Logger';
import type { UICrawlerConfig } from '../types/ui-types';
import type { CrawlerConfig } from '../../../types';

/**
 * Type definitions for logging configuration to replace type assertions
 */
type LogLevelString = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'VERBOSE';

interface LoggingComponents {
  CrawlerState?: LogLevelString;
  CrawlerEngine?: LogLevelString;
  ProductListCollector?: LogLevelString;
  ProductDetailCollector?: LogLevelString;
  PageCrawler?: LogLevelString;
  BrowserManager?: LogLevelString;
  [component: string]: LogLevelString | undefined;
}

interface MutableLoggingConfig {
  level: LogLevelString;
  enableStackTrace: boolean;
  enableTimestamp: boolean;
  components: LoggingComponents;
}

/**
 * 설정 변경 상태 인터페이스
 */
export interface ConfigurationState {
  config: UICrawlerConfig;
  originalConfig: UICrawlerConfig;
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
  @observable.ref accessor config: CrawlerConfig = {} as CrawlerConfig;
  @observable.ref accessor originalConfig: CrawlerConfig = {} as CrawlerConfig;
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
    makeObservable(this, {
      configurationState: computed,
      isValid: computed,
      canSave: computed,
      canReset: computed,
      initialize: action,
      setConfigurationLocked: action,
      updateConfigurationField: action,
      discardChanges: action,
      clearErrorState: action,
      saveConfig: action,
      loadConfiguration: action,
      refreshConfiguration: action,
      saveConfiguration: action,
      autoSave: action,
      updateConfig: action,
      updateMultipleConfig: action,
      resetConfiguration: action,
      resetToDefaults: action,
      updateValidationErrors: action,
      clearError: action,
      importConfiguration: action
    });
    // 비동기 초기화를 constructor 밖에서 실행하도록 변경
    setTimeout(() => this.initialize(), 0);
  }

  // === Computed Properties ===
  get hasChanges(): boolean {
    // Simple property-by-property comparison to avoid MobX cycles
    if (Object.keys(this.config).length !== Object.keys(this.originalConfig).length) {
      return true;
    }
    
    for (const key of Object.keys(this.config) as Array<keyof CrawlerConfig>) {
      if (this.config[key] !== this.originalConfig[key]) {
        return true;
      }
    }
    
    return false;
  }

  @computed get configurationState(): ConfigurationState {
    return {
      config: this.toUICrawlerConfig(this.config),
      originalConfig: this.toUICrawlerConfig(this.originalConfig),
      hasChanges: this.hasChanges,
      isLoading: this.isLoading,
      isSaving: this.isSaving,
      validationErrors: this.validationErrors,
      lastSaved: this.lastSaved,
      error: this.error
    };
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

  // === Initialization ===
  @action
  async initialize(): Promise<void> {
    try {
      await this.loadConfiguration();
      this.logDebug('initialize', 'ConfigurationViewModel initialized successfully');
    } catch (error) {
      runInAction(() => {
        this.error = `Initialization failed: ${error}`;
      });
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
      isDirty: this.hasChanges,
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
      
      console.log('[ConfigurationViewModel] DEBUG: loadedConfig from CrawlingStore:', loadedConfig);
      console.log('[ConfigurationViewModel] DEBUG: loadedConfig keys:', Object.keys(loadedConfig || {}));
      
      // 백엔드에서 {success: true, config: {...}} 형태로 반환하므로 실제 config 추출
      let actualConfig = loadedConfig;
      if (loadedConfig && typeof loadedConfig === 'object' && 'success' in loadedConfig && 'config' in loadedConfig) {
        actualConfig = loadedConfig.config as CrawlerConfig;
        console.log('[ConfigurationViewModel] DEBUG: Extracted actual config from wrapper:', actualConfig);
      }
      
      console.log('[ConfigurationViewModel] DEBUG: actualConfig keys:', Object.keys(actualConfig || {}));
      console.log('[ConfigurationViewModel] DEBUG: actualConfig sample values:', {
        pageRangeLimit: actualConfig?.pageRangeLimit,
        baseUrl: actualConfig?.baseUrl,
        logging: actualConfig?.logging
      });
      
      // 비동기 작업 후 observable 속성 수정은 runInAction으로 감싸기
      runInAction(() => {
        this.config = mobxObservable({ ...actualConfig });
        this.originalConfig = mobxObservable({ ...actualConfig });
        
        console.log('[ConfigurationViewModel] DEBUG: After setting config, this.config keys:', Object.keys(this.config));
        console.log('[ConfigurationViewModel] DEBUG: After setting config, this.config:', this.config);
      });
      
      // 유효성 검사
      this.updateValidationErrors();
      
      this.addLog('Configuration loaded successfully', 'success');
      
    } catch (error) {
      runInAction(() => {
        this.error = `Failed to load configuration: ${error}`;
      });
      this.logError('loadConfiguration', error);
      this.addLog('Failed to load configuration', 'error');
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
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
    // 저장 가능 여부 체크 (MobX 사이클 방지를 위해 직접 계산)
    if (!this.hasChanges || this.isSaving) {
      throw new Error('Cannot save configuration in current state');
    }

    // 유효성 검사를 먼저 수행하고 결과 저장
    const validation = this.validateConfiguration();
    if (!validation.isValid) {
      // 검증 실패 시 validationErrors 업데이트
      runInAction(() => {
        this.validationErrors = validation.errors;
      });
      throw new Error('Configuration validation failed');
    }

    this.isSaving = true;
    this.clearError();

    try {
      // CrawlingStore를 통해 설정 업데이트
      await this.crawlingStore.updateConfig(this.config);
      
      // SessionConfigManager를 통해 세션 설정 저장
      await this.sessionConfigManager.savePendingChanges();
      
      // 비동기 작업 후 observable 속성 수정은 runInAction으로 감싸기
      runInAction(() => {
        this.originalConfig = { ...this.config };
        this.lastSaved = new Date();
        // 성공 시 validationErrors 초기화
        this.validationErrors = {};
      });
      
      this.addLog('Configuration saved successfully', 'success');
      
    } catch (error) {
      runInAction(() => {
        this.error = `Failed to save configuration: ${error}`;
      });
      this.logError('saveConfiguration', error);
      this.addLog('Failed to save configuration', 'error');
      throw error;
    } finally {
      runInAction(() => {
        this.isSaving = false;
      });
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
    this.config = mobxObservable({
      ...this.config,
      [key]: value
    });
    // 해당 필드 유효성 검사
    this.validateField(key, value);
    this.logDebug('updateConfig', `Updated ${key}`, { key, value });
  }

  /**
   * 여러 설정 값 일괄 업데이트
   */
  @action
  updateMultipleConfig(updates: Partial<CrawlerConfig>): void {
    this.config = mobxObservable({
      ...this.config,
      ...updates
    });
    this.updateValidationErrors();
    this.logDebug('updateMultipleConfig', 'Updated multiple config values', updates);
  }

  /**
   * 설정 초기화 (원본으로 되돌리기)
   */
  @action
  resetConfiguration(): void {
    this.config = mobxObservable({ ...this.originalConfig });
    this.validationErrors = {};
    this.clearError();
    this.addLog('Configuration reset to last saved state', 'info');
  }

  /**
   * 기본값으로 초기화
   */
  @action
  resetToDefaults(): void {
    this.config = mobxObservable(this.getDefaultConfiguration());
    this.updateValidationErrors();
    this.clearError();
    this.addLog('Configuration reset to default values', 'info');
  }

  // === Validation ===
  
  /**
   * 전체 설정 유효성 검사 (상태 수정 없이 결과만 반환)
   */
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

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      warnings
    };
  }

  /**
   * 유효성 검사를 실행하고 결과를 validationErrors에 저장
   */
  @action
  updateValidationErrors(): void {
    const validation = this.validateConfiguration();
    this.validationErrors = validation.errors;
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
      autoStatusCheck: true,    // 기본값: 자동 상태 체크 활성화
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
      this.updateValidationErrors();
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

  get isDirty(): boolean {
    return this.hasChanges;
  }

  // === 로깅 설정 관리 메서드 ===
  
  /**
   * 컴포넌트별 로그 레벨 업데이트
   */
  @action
  updateLogLevel(component: string, level: LogLevel): void {
    const config = { ...this.config };
    if (!config.logging) {
      config.logging = {
        level: 'INFO' as const,
        components: {},
        enableStackTrace: false,
        enableTimestamp: true
      };
    }
    
    // Create a mutable copy of logging with proper typing
    const mutableLogging: MutableLoggingConfig = {
      level: (config.logging.level || 'INFO') as LogLevelString,
      enableStackTrace: config.logging.enableStackTrace || false,
      enableTimestamp: config.logging.enableTimestamp || true,
      components: { ...(config.logging.components || {}) }
    };
    
    // Update the component level with type safety
    mutableLogging.components[component] = this.logLevelToString(level);
    
    // Update the config with the new logging object
    this.updateConfig('logging', mutableLogging);
    
    // Logger에 즉시 적용
    Logger.getInstance().setComponentLogLevel(component, level);
    
    this.addLog(`Updated ${component} log level to ${this.logLevelToString(level)}`, 'info');
  }

  /**
   * 전역 로그 레벨 업데이트
   */
  @action
  updateGlobalLogLevel(level: LogLevel): void {
    const config = { ...this.config };
    if (!config.logging) {
      config.logging = {
        level: 'INFO' as const,
        components: {},
        enableStackTrace: false,
        enableTimestamp: true
      };
    }
    
    // Create a mutable copy of logging
    const mutableLogging = {
      level: this.logLevelToString(level),
      enableStackTrace: config.logging.enableStackTrace || false,
      enableTimestamp: config.logging.enableTimestamp || true,
      components: { ...(config.logging.components || {}) }
    };
    
    this.updateConfig('logging', mutableLogging as any);
    
    // Logger에 즉시 적용
    Logger.getInstance().setGlobalLogLevel(level);
    
    this.addLog(`Updated global log level to ${this.logLevelToString(level)}`, 'info');
  }

  /**
   * 로깅 옵션 업데이트 (스택 트레이스, 타임스탬프)
   */
  @action
  updateLoggingOptions(enableStackTrace: boolean, enableTimestamp: boolean): void {
    const config = { ...this.config };
    if (!config.logging) {
      config.logging = {
        level: 'INFO',
        components: {},
        enableStackTrace: false,
        enableTimestamp: true
      };
    }
    
    // Create a mutable copy of logging
    const mutableLogging = {
      level: config.logging.level || 'INFO',
      enableStackTrace: enableStackTrace,
      enableTimestamp: enableTimestamp,
      components: { ...(config.logging.components || {}) }
    };
    
    this.updateConfig('logging', mutableLogging as any);
    
    // Logger에 즉시 적용
    const logger = Logger.getInstance();
    logger.setEnableStackTrace(enableStackTrace);
    logger.setEnableTimestamp(enableTimestamp);
    
    this.addLog('Updated logging options', 'info');
  }

  /**
   * 현재 로깅 설정 반환
   */
  getLoggingConfig() {
    return this.config.logging || {
      level: 'INFO',
      components: {},
      enableStackTrace: false,
      enableTimestamp: true
    };
  }

  /**
   * 특정 컴포넌트의 로그 레벨 반환
   */
  getComponentLogLevel(component: string): LogLevel {
    const loggingConfig = this.getLoggingConfig();
    const components = loggingConfig.components as LoggingComponents | undefined;
    const levelString = components?.[component] || loggingConfig.level || 'INFO';
    return this.stringToLogLevel(levelString);
  }

  /**
   * 로그 레벨을 문자열로 변환
   */
  logLevelToString(level: LogLevel): LogLevelString {
    switch (level) {
      case LogLevel.ERROR: return 'ERROR';
      case LogLevel.WARN: return 'WARN';
      case LogLevel.INFO: return 'INFO';
      case LogLevel.DEBUG: return 'DEBUG';
      case LogLevel.VERBOSE: return 'VERBOSE';
      default: return 'INFO';
    }
  }

  /**
   * 문자열을 로그 레벨로 변환
   */
  stringToLogLevel(levelString: string): LogLevel {
    switch (levelString.toUpperCase()) {
      case 'ERROR': return LogLevel.ERROR;
      case 'WARN': return LogLevel.WARN;
      case 'INFO': return LogLevel.INFO;
      case 'DEBUG': return LogLevel.DEBUG;
      case 'VERBOSE': return LogLevel.VERBOSE;
      default: return LogLevel.INFO;
    }
  }

  /**
   * 사용 가능한 컴포넌트 목록 반환
   */
  getAvailableComponents(): string[] {
    return [
      'CrawlerState',
      'CrawlerEngine', 
      'ProductListCollector',
      'ProductDetailCollector',
      'PageCrawler',
      'BrowserManager'
    ];
  }

  /**
   * 로깅 설정을 즉시 적용
   */
  @action
  applyLoggingConfig(): void {
    const loggingConfig = this.getLoggingConfig();
    const logger = Logger.getInstance();
    
    // 전역 로그 레벨 설정
    logger.setGlobalLogLevel(this.stringToLogLevel(loggingConfig.level || 'INFO'));
    
    // 컴포넌트별 로그 레벨 설정
    if (loggingConfig.components) {
      Object.entries(loggingConfig.components).forEach(([component, level]) => {
        if (level) {
          logger.setComponentLogLevel(component, this.stringToLogLevel(level));
        }
      });
    }
    
    // 로깅 옵션 설정
    logger.setEnableStackTrace(loggingConfig.enableStackTrace || false);
    logger.setEnableTimestamp(loggingConfig.enableTimestamp !== false);
    
    this.addLog('Applied logging configuration', 'info');
  }

  // Helper function to convert CrawlerConfig to UICrawlerConfig
  private toUICrawlerConfig(config: CrawlerConfig): UICrawlerConfig {
    return {
      ...config,
      logging: {
        level: config.logging?.level || 'INFO',
        enableStackTrace: config.logging?.enableStackTrace || false,
        enableTimestamp: config.logging?.enableTimestamp || true,
        components: { ...(config.logging?.components || {}) }
      }
    } as UICrawlerConfig;
  }
}
