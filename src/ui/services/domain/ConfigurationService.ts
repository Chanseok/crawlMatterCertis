import { BaseService } from '../base/BaseService';
import { ConfigUtils } from '../../../shared/utils/ConfigUtils';
import type { CrawlerConfig } from '../../../../types';

/**
 * ConfigurationService.ts
 * IPC-based configuration service for UI components
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
   */
  public async getConfig(): Promise<CrawlerConfig> {
    try {      this.log('getConfig: Fetching configuration from backend');

      // Call IPC to get configuration from ConfigManager
      const result = await this.ipcService.call<any>('getConfig');
      
      if (result.success && result.config) {
        this.currentConfig = result.config;
        this.log('getConfig: Configuration retrieved successfully');
        return result.config;
      } else {
        throw new Error(result.error || 'Failed to get configuration');
      }
    } catch (error) {
      this.logError('getConfig failed', this.createError('CONFIG_FETCH_FAILED', 'Failed to fetch configuration', error));
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get configuration: ${errorMessage}`);
    }
  }

  /**
   * Update configuration with validation
   */
  public async updateConfig(config: Partial<CrawlerConfig>): Promise<CrawlerConfig> {
    try {
      this.log('updateConfig: Updating configuration with keys: ' + Object.keys(config).join(', '));
      
      // Use ConfigUtils for validation and merging
      const validationResult = ConfigUtils.mergeConfig(
        this.currentConfig || ConfigUtils.getDefaultConfig(), 
        config
      );
      
      if (!validationResult.success) {
        this.logError('updateConfig validation failed', this.createError('CONFIG_VALIDATION_FAILED', 'Configuration validation failed', validationResult.error));
        throw new Error(validationResult.error || 'Configuration validation failed');
      }

      // Log warnings if any
      if (validationResult.warnings && validationResult.warnings.length > 0) {
        validationResult.warnings.forEach(warning => {
          this.logger.info('Configuration update warnings', warning);
        });
      }

      // Call IPC to update configuration in ConfigManager
      // BaseService.ipcService automatically handles MobX observable conversion
      const result = await this.ipcService.call<any>('updateConfig', config);
      
      if (result.success && result.config) {
        // Post-validate the complete configuration returned from backend
        const backendValidation = ConfigUtils.validateConfig(result.config);
        
        if (!backendValidation.success) {
          this.logError('updateConfig backend validation failed', this.createError('CONFIG_BACKEND_VALIDATION_FAILED', 'Backend returned invalid configuration', backendValidation.error));
          throw new Error(backendValidation.error || 'Backend validation failed');
        }

        this.currentConfig = result.config;
        this.log('updateConfig: Configuration updated and validated successfully');
        return result.config;
      } else {
        throw new Error(result.error || 'Failed to update configuration');
      }
    } catch (error) {
      this.logError('updateConfig failed', this.createError('CONFIG_UPDATE_FAILED', 'Failed to update configuration', { error, configKeys: Object.keys(config) }));
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to update configuration: ${errorMessage}`);
    }
  }

  /**
   * Reset configuration to defaults
   */
  public async resetConfig(): Promise<CrawlerConfig> {
    try {      this.log('resetConfig: Resetting configuration to defaults');

      // Call IPC to reset configuration in ConfigManager
      const result = await this.ipcService.call<any>('resetConfig');
      
      if (result.success && result.config) {
        this.currentConfig = result.config;
        this.log('resetConfig: Configuration reset successfully');
        return result.config;
      } else {
        throw new Error(result.error || 'Failed to reset configuration');
      }
    } catch (error) {
      this.logError('resetConfig failed', this.createError('CONFIG_RESET_FAILED', 'Failed to reset configuration', error));
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to reset configuration: ${errorMessage}`);
    }
  }

  /**
   * Get cached configuration
   */
  public getCachedConfig(): CrawlerConfig | null {
    return this.currentConfig || null;
  }

  /**
   * Get configuration file path
   */
  public async getConfigPath(): Promise<string> {
    try {
      // Call IPC to get configuration file path from ConfigManager
      const result = await this.ipcService.call<any>('getConfigPath');
      
      if (result.success && result.configPath) {
        return result.configPath;
      } else {
        throw new Error(result.error || 'Failed to get configuration path');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get configuration path: ${errorMessage}`);
    }
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
