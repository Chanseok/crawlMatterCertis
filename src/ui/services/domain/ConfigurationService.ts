import { BaseService } from '../base/BaseService';
import { ConfigUtils } from '../../../shared/utils/ConfigUtils';
import type { CrawlerConfig } from '../../../../types';

/**
 * ConfigurationService.ts
 * IPC-based configuration service for UI components
 * 
 * Phase 3: Service Layer Refactoring
 * - Enhanced with resilience management for configuration operations
 * - Improved service lifecycle management  
 * - Standardized error handling and recovery patterns
 * 
 * REFACTORED: Now uses centralized ConfigUtils for:
 * - Configuration validation (ConfigUtils.validateConfig)
 * - Safe configuration merging (ConfigUtils.mergeConfig)
 * - Standardized error handling (ConfigOperationResult<T>)
 * 
 * This service bridges the gap between frontend configuration needs
 * and backend ConfigManager, using unified configuration patterns.
 */

/**
 * Configuration Service
 * 
 * Phase 3 Enhanced Features:
 * - Resilience patterns for configuration operations
 * - Enhanced error handling and recovery
 * - Improved service lifecycle management
 * 
 * Handles all configuration-related operations including:
 * - Getting current configuration
 * - Updating configuration with validation
 * - Resetting configuration to defaults
 * - Configuration validation and type checking
 * 
 * Uses safe IPC communication through BaseService.
 */
export class ConfigurationService extends BaseService {
  private static instance: ConfigurationService;
  private currentConfig?: CrawlerConfig;

  private constructor() {
    super('ConfigurationService');
    // Initialize resilience patterns for database-like operations  
    this.initializeResilience({ 
      serviceType: 'database',
      enableCircuitBreaker: true,
      enableRetry: true 
    });
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): ConfigurationService {
    if (!ConfigurationService.instance) {
      ConfigurationService.instance = new ConfigurationService();
    }
    return ConfigurationService.instance;
  }

  /**
   * Get the current configuration
   * Enhanced with resilience patterns
   */
  public async getConfig(): Promise<CrawlerConfig> {
    const result = await this.executeOperation(async () => {
      this.log('getConfig: Fetching configuration from backend');

      if (!this.isIPCAvailable()) {
        throw new Error('IPC not available');
      }

      // Call IPC to get configuration from ConfigManager
      const ipcResult = await this.ipcService.call<any>('getConfig');
      
      if (ipcResult.success && ipcResult.config) {
        this.currentConfig = ipcResult.config;
        this.log('getConfig: Configuration retrieved successfully');
        return ipcResult.config;
      } else {
        throw new Error(ipcResult.error || 'Failed to get configuration');
      }
    }, 'getConfig');

    if (!result.success) {
      throw new Error(`Failed to get configuration: ${result.error?.message || 'Unknown error'}`);
    }

    return result.data!;
  }

  /**
   * Update configuration with validation
   * Enhanced with resilience patterns
   */
  public async updateConfig(config: Partial<CrawlerConfig>): Promise<CrawlerConfig> {
    const result = await this.executeOperation(async () => {
      this.log('updateConfig: Updating configuration with keys: ' + Object.keys(config).join(', '));
      
      // Use ConfigUtils for validation and merging
      const validationResult = ConfigUtils.mergeConfig(
        this.currentConfig || ConfigUtils.getDefaultConfig(), 
        config
      );
      
      if (!validationResult.success) {
        throw new Error(validationResult.error || 'Configuration validation failed');
      }

      // Log warnings if any
      if (validationResult.warnings && validationResult.warnings.length > 0) {
        validationResult.warnings.forEach(warning => {
          this.logger.info('Configuration update warnings', warning);
        });
      }

      if (!this.isIPCAvailable()) {
        throw new Error('IPC not available');
      }

      // Call IPC to update configuration in ConfigManager
      // BaseService.ipcService automatically handles MobX observable conversion
      const ipcResult = await this.ipcService.call<any>('updateConfig', config);
      
      if (ipcResult.success && ipcResult.config) {
        // Post-validate the complete configuration returned from backend
        const backendValidation = ConfigUtils.validateConfig(ipcResult.config);
        
        if (!backendValidation.success) {
          throw new Error(backendValidation.error || 'Backend validation failed');
        }

        this.currentConfig = ipcResult.config;
        this.log('updateConfig: Configuration updated and validated successfully');
        return ipcResult.config;
      } else {
        throw new Error(ipcResult.error || 'Failed to update configuration');
      }
    }, 'updateConfig');

    if (!result.success) {
      throw new Error(`Failed to update configuration: ${result.error?.message || 'Unknown error'}`);
    }

    return result.data!;
  }

  /**
   * Reset configuration to defaults
   * Enhanced with resilience patterns
   */
  public async resetConfig(): Promise<CrawlerConfig> {
    const result = await this.executeOperation(async () => {
      this.log('resetConfig: Resetting configuration to defaults');

      if (!this.isIPCAvailable()) {
        throw new Error('IPC not available');
      }

      // Call IPC to reset configuration in ConfigManager
      const ipcResult = await this.ipcService.call<any>('resetConfig');
      
      if (ipcResult.success && ipcResult.config) {
        this.currentConfig = ipcResult.config;
        this.log('resetConfig: Configuration reset successfully');
        return ipcResult.config;
      } else {
        throw new Error(ipcResult.error || 'Failed to reset configuration');
      }
    }, 'resetConfig');

    if (!result.success) {
      throw new Error(`Failed to reset configuration: ${result.error?.message || 'Unknown error'}`);
    }

    return result.data!;
  }

  /**
   * Get cached configuration
   */
  public getCachedConfig(): CrawlerConfig | null {
    return this.currentConfig || null;
  }

  /**
   * Get configuration file path
   * Enhanced with resilience patterns
   */
  public async getConfigPath(): Promise<string> {
    const result = await this.executeOperation(async () => {
      if (!this.isIPCAvailable()) {
        throw new Error('IPC not available');
      }

      // Call IPC to get configuration file path from ConfigManager
      const ipcResult = await this.ipcService.call<any>('getConfigPath');
      
      if (ipcResult.success && ipcResult.configPath) {
        return ipcResult.configPath;
      } else {
        throw new Error(ipcResult.error || 'Failed to get configuration path');
      }
    }, 'getConfigPath');

    if (!result.success) {
      throw new Error(`Failed to get configuration path: ${result.error?.message || 'Unknown error'}`);
    }

    return result.data!;
  }

  /**
   * Validate complete configuration using Value Object pattern
   */
  public validateConfigComplete(config: CrawlerConfig): void {
    const validationResult = ConfigUtils.validateConfig(config);
    
    if (!validationResult.success) {
      throw new Error(validationResult.error || 'Configuration validation failed');
    }

    // Log warnings if any
    if (validationResult.warnings && validationResult.warnings.length > 0) {
      validationResult.warnings.forEach(warning => {
        this.logger.info('Configuration validation warnings', warning);
      });
    }
  }

  /**
   * Check if configuration is loaded
   */
  public isConfigLoaded(): boolean {
    return this.currentConfig !== undefined;
  }

  /**
   * Get specific configuration value
   */
  public getConfigValue<K extends keyof CrawlerConfig>(key: K): CrawlerConfig[K] | undefined {
    return this.currentConfig?.[key];
  }

  /**
   * Get service status
   */
  public getStatus(): {
    isConfigLoaded: boolean;
    configKeys: string[];
    lastUpdated: string;
  } {
    return {
      isConfigLoaded: this.isConfigLoaded(),
      configKeys: this.currentConfig ? Object.keys(this.currentConfig) : [],
      lastUpdated: new Date().toISOString()
    };
  }
}
