import { BaseService } from '../core/BaseService';
import { ConfigurationValidator } from '../../../shared/domain/ConfigurationValue';
import type { CrawlerConfig } from '../../../../types';

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
    super();
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
    try {
      this.logDebug('getConfig', 'Fetching configuration from backend');
      
      // Call IPC to get configuration from ConfigManager
      const result = await this.callIPC<any>('getConfig');
      
      if (result.success && result.config) {
        this.currentConfig = result.config;
        this.logDebug('getConfig', 'Configuration retrieved successfully');
        return result.config;
      } else {
        throw new Error(result.error || 'Failed to get configuration');
      }
    } catch (error) {
      this.logError('getConfig', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get configuration: ${errorMessage}`);
    }
  }

  /**
   * Update configuration with validation
   */
  public async updateConfig(config: Partial<CrawlerConfig>): Promise<CrawlerConfig> {
    try {
      this.logDebug('updateConfig', 'Updating configuration', { configKeys: Object.keys(config) });
      
      // Pre-validate the configuration update using Value Object pattern
      const validationResult = ConfigurationValidator.validatePartialUpdate(
        this.currentConfig || {} as CrawlerConfig, 
        config
      );
      
      if (!validationResult.isValid) {
        const errorMessages = Object.entries(validationResult.errors)
          .map(([field, errors]) => `${field}: ${errors.join(', ')}`);
        
        this.logError('updateConfig', 'Configuration validation failed', { 
          errors: validationResult.errors 
        });
        throw new Error(`Configuration validation failed: ${errorMessages.join('; ')}`);
      }

      // Log warnings if any
      const warningMessages = Object.entries(validationResult.warnings);
      if (warningMessages.length > 0) {
        const warningText = warningMessages
          .map(([field, warnings]) => `${field}: ${warnings.join(', ')}`)
          .join('; ');
        console.warn('Configuration update warnings:', warningText);
      }

      // Call IPC to update configuration in ConfigManager
      // BaseService.callIPC automatically handles MobX observable conversion
      const result = await this.callIPC<any>('updateConfig', config);
      
      if (result.success && result.config) {
        // Post-validate the complete configuration returned from backend
        const completeValidationResult = ConfigurationValidator.validateComplete(result.config);
        
        if (!completeValidationResult.isValid) {
          const errorMessages = Object.entries(completeValidationResult.errors)
            .map(([field, errors]) => `${field}: ${errors.join(', ')}`);
          
          this.logError('updateConfig', 'Backend returned invalid configuration', {
            errors: completeValidationResult.errors
          });
          throw new Error(`Backend validation failed: ${errorMessages.join('; ')}`);
        }

        this.currentConfig = result.config;
        this.logDebug('updateConfig', 'Configuration updated and validated successfully');
        return result.config;
      } else {
        throw new Error(result.error || 'Failed to update configuration');
      }
    } catch (error) {
      this.logError('updateConfig', error, { configKeys: Object.keys(config) });
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to update configuration: ${errorMessage}`);
    }
  }

  /**
   * Reset configuration to defaults
   */
  public async resetConfig(): Promise<CrawlerConfig> {
    try {
      this.logDebug('resetConfig', 'Resetting configuration to defaults');
      
      // Call IPC to reset configuration in ConfigManager
      const result = await this.callIPC<any>('resetConfig');
      
      if (result.success && result.config) {
        this.currentConfig = result.config;
        this.logDebug('resetConfig', 'Configuration reset successfully');
        return result.config;
      } else {
        throw new Error(result.error || 'Failed to reset configuration');
      }
    } catch (error) {
      this.logError('resetConfig', error);
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
      const result = await this.callIPC<any>('getConfigPath');
      
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
    const validationResult = ConfigurationValidator.validateComplete(config);
    
    if (!validationResult.isValid) {
      const errorMessages = Object.entries(validationResult.errors)
        .map(([field, errors]) => `${field}: ${errors.join(', ')}`);
      
      throw new Error(`Configuration validation failed: ${errorMessages.join('; ')}`);
    }

    // Log warnings if any
    const warningMessages = Object.entries(validationResult.warnings);
    if (warningMessages.length > 0) {
      const warningText = warningMessages
        .map(([field, warnings]) => `${field}: ${warnings.join(', ')}`)
        .join('; ');
      console.warn('Configuration validation warnings:', warningText);
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
