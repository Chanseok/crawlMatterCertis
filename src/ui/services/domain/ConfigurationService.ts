import { BaseService } from '../core/BaseService';
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
      
      // Validate the configuration update
      this.validateConfigUpdate(config);

      // Call IPC to update configuration in ConfigManager
      // BaseService.callIPC automatically handles MobX observable conversion
      const result = await this.callIPC<any>('updateConfig', config);
      
      if (result.success && result.config) {
        // Validate the complete configuration returned from backend
        this.validateConfigComplete(result.config);

        this.currentConfig = result.config;
        this.logDebug('updateConfig', 'Configuration updated successfully');
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
   * Validate complete configuration (throws on error)
   */
  public validateConfigComplete(config: CrawlerConfig): void {
    // Validate required fields
    if (typeof config.pageRangeLimit !== 'number' || config.pageRangeLimit <= 0) {
      throw new Error('Page range limit must be a positive number');
    }

    if (typeof config.productListRetryCount !== 'number' || config.productListRetryCount < 0) {
      throw new Error('Product list retry count must be a non-negative number');
    }

    if (typeof config.productDetailRetryCount !== 'number' || config.productDetailRetryCount < 0) {
      throw new Error('Product detail retry count must be a non-negative number');
    }

    if (typeof config.productsPerPage !== 'number' || config.productsPerPage <= 0) {
      throw new Error('Products per page must be a positive number');
    }

    if (typeof config.autoAddToLocalDB !== 'boolean') {
      throw new Error('Auto add to local DB must be a boolean');
    }

    if (typeof config.autoStatusCheck !== 'boolean') {
      throw new Error('Auto status check must be a boolean');
    }

    // Validate optional fields
    if (config.headlessBrowser !== undefined && typeof config.headlessBrowser !== 'boolean') {
      throw new Error('Headless browser must be a boolean');
    }

    if (config.crawlerType !== undefined && !['playwright', 'axios'].includes(config.crawlerType)) {
      throw new Error('Crawler type must be either "playwright" or "axios"');
    }

    if (config.maxConcurrentTasks !== undefined && (typeof config.maxConcurrentTasks !== 'number' || config.maxConcurrentTasks <= 0)) {
      throw new Error('Max concurrent tasks must be a positive number');
    }

    if (config.requestDelay !== undefined && (typeof config.requestDelay !== 'number' || config.requestDelay < 0)) {
      throw new Error('Request delay must be a non-negative number');
    }

    if (config.batchSize !== undefined && (typeof config.batchSize !== 'number' || config.batchSize <= 0)) {
      throw new Error('Batch size must be a positive number');
    }

    if (config.batchDelayMs !== undefined && (typeof config.batchDelayMs !== 'number' || config.batchDelayMs < 0)) {
      throw new Error('Batch delay must be a non-negative number');
    }

    if (config.enableBatchProcessing !== undefined && typeof config.enableBatchProcessing !== 'boolean') {
      throw new Error('Enable batch processing must be a boolean');
    }

    if (config.batchRetryLimit !== undefined && (typeof config.batchRetryLimit !== 'number' || config.batchRetryLimit < 0)) {
      throw new Error('Batch retry limit must be a non-negative number');
    }
  }

  /**
   * Validate partial configuration update (throws on error)
   */
  private validateConfigUpdate(config: Partial<CrawlerConfig>): void {
    if (config.pageRangeLimit !== undefined && (typeof config.pageRangeLimit !== 'number' || config.pageRangeLimit <= 0)) {
      throw new Error('Page range limit must be a positive number');
    }

    if (config.productListRetryCount !== undefined && (typeof config.productListRetryCount !== 'number' || config.productListRetryCount < 0)) {
      throw new Error('Product list retry count must be a non-negative number');
    }

    if (config.productDetailRetryCount !== undefined && (typeof config.productDetailRetryCount !== 'number' || config.productDetailRetryCount < 0)) {
      throw new Error('Product detail retry count must be a non-negative number');
    }

    if (config.productsPerPage !== undefined && (typeof config.productsPerPage !== 'number' || config.productsPerPage <= 0)) {
      throw new Error('Products per page must be a positive number');
    }

    if (config.autoAddToLocalDB !== undefined && typeof config.autoAddToLocalDB !== 'boolean') {
      throw new Error('Auto add to local DB must be a boolean');
    }

    if (config.headlessBrowser !== undefined && typeof config.headlessBrowser !== 'boolean') {
      throw new Error('Headless browser must be a boolean');
    }

    if (config.crawlerType !== undefined && !['playwright', 'axios'].includes(config.crawlerType)) {
      throw new Error('Crawler type must be either "playwright" or "axios"');
    }

    if (config.maxConcurrentTasks !== undefined && (typeof config.maxConcurrentTasks !== 'number' || config.maxConcurrentTasks <= 0)) {
      throw new Error('Max concurrent tasks must be a positive number');
    }

    if (config.requestDelay !== undefined && (typeof config.requestDelay !== 'number' || config.requestDelay < 0)) {
      throw new Error('Request delay must be a non-negative number');
    }

    if (config.batchSize !== undefined && (typeof config.batchSize !== 'number' || config.batchSize <= 0)) {
      throw new Error('Batch size must be a positive number');
    }

    if (config.batchDelayMs !== undefined && (typeof config.batchDelayMs !== 'number' || config.batchDelayMs < 0)) {
      throw new Error('Batch delay must be a non-negative number');
    }

    if (config.enableBatchProcessing !== undefined && typeof config.enableBatchProcessing !== 'boolean') {
      throw new Error('Enable batch processing must be a boolean');
    }

    if (config.batchRetryLimit !== undefined && (typeof config.batchRetryLimit !== 'number' || config.batchRetryLimit < 0)) {
      throw new Error('Batch retry limit must be a non-negative number');
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
