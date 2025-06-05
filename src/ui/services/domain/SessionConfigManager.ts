import { makeAutoObservable, runInAction, toJS } from 'mobx';
import { ConfigurationService } from './ConfigurationService';
import { ConfigurationValidator } from '../../../shared/domain/ConfigurationValue';
import type { CrawlerConfig } from '../../../../types';

/**
 * Session-based Configuration Manager
 * 
 * Provides session-aware configuration management with:
 * - Real-time UI synchronization
 * - Configuration protection during crawling
 * - Cache invalidation logic
 * - Validation consistency
 * - Session state management
 */
export class SessionConfigManager {
  private static instance: SessionConfigManager;
  private configService: ConfigurationService;
  
  // Observable state
  public config: CrawlerConfig | null = null;
  public isLoading = false;
  public lastError: string | null = null;
  public isConfigLocked = false; // 크롤링 중 설정 보호
  public sessionId: string;
  public lastUpdated: Date | null = null;
  public pendingChanges: Partial<CrawlerConfig> = {};
  public isDirty = false;

  // Cache management
  private cacheValidUntil: Date | null = null;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5분

  private constructor() {
    makeAutoObservable(this);
    this.configService = ConfigurationService.getInstance();
    this.sessionId = this.generateSessionId();
    
    // 페이지 언로드 시 변경사항 저장
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));
    }
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): SessionConfigManager {
    if (!SessionConfigManager.instance) {
      SessionConfigManager.instance = new SessionConfigManager();
    }
    return SessionConfigManager.instance;
  }

  /**
   * Initialize session and load configuration
   */
  public async initialize(): Promise<void> {
    await this.loadConfig(true);
  }

  /**
   * Load configuration with cache management
   */
  public async loadConfig(forceRefresh = false): Promise<CrawlerConfig> {
    if (!forceRefresh && this.isCacheValid()) {
      return this.config!;
    }

    runInAction(() => {
      this.isLoading = true;
      this.lastError = null;
    });

    try {
      const config = await this.configService.getConfig();
      
      runInAction(() => {
        this.config = config;
        this.lastUpdated = new Date();
        this.cacheValidUntil = new Date(Date.now() + this.CACHE_TTL_MS);
        this.isLoading = false;
        this.clearPendingChanges();
      });

      return config;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      runInAction(() => {
        this.lastError = errorMessage;
        this.isLoading = false;
      });

      throw error;
    }
  }

  /**
   * Update configuration with session protection
   */
  public async updateConfig(updates: Partial<CrawlerConfig>): Promise<CrawlerConfig> {
    if (this.isConfigLocked) {
      throw new Error('Configuration is locked during crawling operation');
    }

    // 변경사항을 pending에 추가
    runInAction(() => {
      this.pendingChanges = { ...this.pendingChanges, ...updates };
      this.isDirty = true;
      this.isLoading = true;
      this.lastError = null;
    });

    try {
      // MobX observable을 일반 객체로 변환하여 IPC 전송 가능하게 만듦
      const plainUpdates = toJS(updates);
      console.log('🔄 SessionConfigManager: updateConfig converting MobX to plain object', {
        originalUpdates: updates,
        plainUpdates: plainUpdates,
        isProxy: updates.constructor?.name === 'Object' ? 'Plain' : 'Proxy'
      });

      // 클라이언트 측 사전 검증 (Value Object 패턴 적용)
      if (this.config) {
        const validationResult = ConfigurationValidator.validatePartialUpdate(
          this.config, 
          plainUpdates
        );
        
        if (!validationResult.isValid) {
          const errorDetails = Object.entries(validationResult.errors)
            .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
            .join('; ');
          throw new Error(`Configuration validation failed: ${errorDetails}`);
        }
        
        // 경고 로그 출력
        if (Object.keys(validationResult.warnings).length > 0) {
          const warningDetails = Object.entries(validationResult.warnings)
            .map(([field, warnings]) => `${field}: ${warnings.join(', ')}`)
            .join('; ');
          console.warn(`[SessionConfigManager] 설정 경고:`, warningDetails);
        }
      }

      const updatedConfig = await this.configService.updateConfig(plainUpdates);
      
      runInAction(() => {
        this.config = updatedConfig;
        this.lastUpdated = new Date();
        this.cacheValidUntil = new Date(Date.now() + this.CACHE_TTL_MS);
        this.isLoading = false;
        this.clearPendingChanges();
      });

      return updatedConfig;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      runInAction(() => {
        this.lastError = errorMessage;
        this.isLoading = false;
      });

      throw error;
    }
  }

  /**
   * Reset configuration to defaults
   */
  public async resetConfig(): Promise<CrawlerConfig> {
    if (this.isConfigLocked) {
      throw new Error('Configuration is locked during crawling operation');
    }

    runInAction(() => {
      this.isLoading = true;
      this.lastError = null;
    });

    try {
      const resetConfig = await this.configService.resetConfig();
      
      runInAction(() => {
        this.config = resetConfig;
        this.lastUpdated = new Date();
        this.cacheValidUntil = new Date(Date.now() + this.CACHE_TTL_MS);
        this.isLoading = false;
        this.clearPendingChanges();
      });

      return resetConfig;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      runInAction(() => {
        this.lastError = errorMessage;
        this.isLoading = false;
      });

      throw error;
    }
  }

  /**
   * Lock configuration during crawling
   */
  public lockConfig(): void {
    runInAction(() => {
      this.isConfigLocked = true;
    });
  }

  /**
   * Unlock configuration after crawling
   */
  public unlockConfig(): void {
    runInAction(() => {
      this.isConfigLocked = false;
    });
  }

  /**
   * Save pending changes
   */
  public async savePendingChanges(): Promise<void> {
    if (!this.isDirty || Object.keys(this.pendingChanges).length === 0) {
      return;
    }

    // MobX observable을 일반 객체로 변환하여 IPC 전송 가능하게 만듦
    const plainPendingChanges = toJS(this.pendingChanges);
    await this.updateConfig(plainPendingChanges);
  }

  /**
   * Discard pending changes
   */
  public discardPendingChanges(): void {
    runInAction(() => {
      this.pendingChanges = {};
      this.isDirty = false;
    });
  }

  /**
   * Get specific configuration value
   */
  public getConfigValue<K extends keyof CrawlerConfig>(key: K): CrawlerConfig[K] | undefined {
    return this.config?.[key];
  }

  /**
   * Temporarily update a configuration value (not saved until savePendingChanges)
   */
  public setPendingValue<K extends keyof CrawlerConfig>(key: K, value: CrawlerConfig[K]): void {
    console.log('🔧 SessionConfigManager: setPendingValue called', { 
      key, 
      value, 
      previousPendingValue: this.pendingChanges[key],
      previousEffectiveValue: this.getEffectiveValue(key),
      isDirtyBefore: this.isDirty,
      pendingChangesCountBefore: Object.keys(this.pendingChanges).length
    });
    
    runInAction(() => {
      this.pendingChanges = {
        ...this.pendingChanges,
        [key]: value
      };
      this.isDirty = true;
    });
    
    console.log('✅ SessionConfigManager: setPendingValue completed', { 
      newEffectiveValue: this.getEffectiveValue(key),
      isDirtyAfter: this.isDirty,
      pendingChangesCountAfter: Object.keys(this.pendingChanges).length,
      allPendingChanges: this.pendingChanges
    });
  }

  /**
   * Get effective configuration value (with pending changes)
   */
  public getEffectiveValue<K extends keyof CrawlerConfig>(key: K): CrawlerConfig[K] | undefined {
    const hasPendingValue = key in this.pendingChanges;
    const pendingValue = this.pendingChanges[key];
    const configValue = this.config?.[key];
    const effectiveValue = hasPendingValue ? pendingValue : configValue;
    
    // 값 변경 시에만 로그 출력 (컴포넌트 렌더링 시 매번 호출되므로)
    if (hasPendingValue) {
      console.log('📖 SessionConfigManager: getEffectiveValue (with pending)', { 
        key, 
        pendingValue, 
        configValue, 
        effectiveValue 
      });
    }
    
    return effectiveValue;
  }

  /**
   * Invalidate cache
   */
  public invalidateCache(): void {
    runInAction(() => {
      this.cacheValidUntil = null;
    });
  }

  /**
   * Check if cache is valid
   */
  public isCacheValid(): boolean {
    return this.config !== null && 
           this.cacheValidUntil !== null && 
           this.cacheValidUntil > new Date();
  }

  /**
   * Clear pending changes
   */
  private clearPendingChanges(): void {
    runInAction(() => {
      this.pendingChanges = {};
      this.isDirty = false;
    });
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Handle page unload - save pending changes
   */
  public handleBeforeUnload(): void {
    if (this.isDirty) {
      // Note: 브라우저 제약으로 비동기 작업은 불가능
      // 대신 localStorage에 임시 저장하고 다음 세션에서 복원
      try {
        localStorage.setItem('crawlMatter_pendingConfig', JSON.stringify({
          sessionId: this.sessionId,
          pendingChanges: this.pendingChanges,
          timestamp: Date.now()
        }));
      } catch (error) {
        console.warn('Failed to save pending changes to localStorage:', error);
      }
    }
  }

  /**
   * Restore pending changes from previous session
   */
  public async restorePendingChanges(): Promise<void> {
    try {
      const stored = localStorage.getItem('crawlMatter_pendingConfig');
      if (stored) {
        const { pendingChanges, timestamp } = JSON.parse(stored);
        
        // 1시간 이내의 변경사항만 복원
        if (Date.now() - timestamp < 60 * 60 * 1000) {
          runInAction(() => {
            this.pendingChanges = pendingChanges;
            this.isDirty = Object.keys(pendingChanges).length > 0;
          });
        }
        
        localStorage.removeItem('crawlMatter_pendingConfig');
      }
    } catch (error) {
      console.warn('Failed to restore pending changes:', error);
    }
  }

  /**
   * Clear current error state
   */
  public clearError(): void {
    runInAction(() => {
      this.lastError = null;
    });
  }

  /**
   * Get session status
   */
  public getSessionStatus() {
    return {
      sessionId: this.sessionId,
      isConfigLoaded: this.config !== null,
      isLocked: this.isConfigLocked,
      isDirty: this.isDirty,
      pendingChangesCount: Object.keys(this.pendingChanges).length,
      lastUpdated: this.lastUpdated,
      cacheValid: this.isCacheValid(),
      lastError: this.lastError
    };
  }

  /**
   * Validate current configuration
   */
  public validateCurrentConfig(): { isValid: boolean; errors: string[] } {
    if (!this.config) {
      return { isValid: false, errors: ['No configuration loaded'] };
    }

    const errors: string[] = [];

    try {
      this.configService.validateConfigComplete(this.config);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
