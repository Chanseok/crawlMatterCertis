import { BaseService } from '../base/BaseService';
import { ServiceResult } from '../base/BaseService';
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
 * This service replaces the functional configService.ts approach with a 
 * proper domain service following Clean Architecture principles.
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
  public async getConfig(): Promise<ServiceResult<CrawlerConfig>> {
    try {
      // Mock implementation - in real app would call IPC to get config
      const config: CrawlerConfig = {
        pageRangeLimit: 100,
        productListRetryCount: 3,
        productDetailRetryCount: 3,
        productsPerPage: 20,
        autoAddToLocalDB: true,
        headlessBrowser: true,
        crawlerType: 'axios',
        maxConcurrentTasks: 5,
        requestDelay: 1000,
        batchSize: 30,
        batchDelayMs: 2000,
        enableBatchProcessing: true,
        batchRetryLimit: 3
      };

      this.currentConfig = config;
      return this.createSuccess(config);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createFailure(this.createError('FETCH_ERROR', `Failed to get configuration: ${errorMessage}`));
    }
  }

  /**
   * Update configuration with validation
   */
  public async updateConfig(config: Partial<CrawlerConfig>): Promise<ServiceResult<CrawlerConfig>> {
    try {
      // Validate the configuration update
      this.validateConfigUpdate(config);

      // Mock implementation - merge with current config
      const currentConfig = this.currentConfig || await this.getDefaultConfig();
      const updatedConfig = { ...currentConfig, ...config };

      // Validate the complete configuration
      const validationResult = this.validateConfig(updatedConfig);
      if (!validationResult.success) {
        return this.createFailure(validationResult.error!);
      }

      this.currentConfig = updatedConfig;
      return this.createSuccess(updatedConfig);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createFailure(this.createError('UPDATE_ERROR', `Failed to update configuration: ${errorMessage}`));
    }
  }

  /**
   * Reset configuration to defaults
   */
  public async resetConfig(): Promise<ServiceResult<CrawlerConfig>> {
    try {
      const defaultConfig = await this.getDefaultConfig();
      this.currentConfig = defaultConfig;
      return this.createSuccess(defaultConfig);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createFailure(this.createError('RESET_ERROR', `Failed to reset configuration: ${errorMessage}`));
    }
  }

  /**
   * Get cached configuration
   */
  public getCachedConfig(): CrawlerConfig | null {
    return this.currentConfig || null;
  }

  /**
   * Validate complete configuration
   */
  public validateConfig(config: CrawlerConfig): ServiceResult<boolean> {
    try {
      // Validate required fields
      if (typeof config.pageRangeLimit !== 'number' || config.pageRangeLimit <= 0) {
        return this.createFailure(this.createError('VALIDATION_ERROR', 'Page range limit must be a positive number'));
      }

      if (typeof config.productListRetryCount !== 'number' || config.productListRetryCount < 0) {
        return this.createFailure(this.createError('VALIDATION_ERROR', 'Product list retry count must be a non-negative number'));
      }

      if (typeof config.productDetailRetryCount !== 'number' || config.productDetailRetryCount < 0) {
        return this.createFailure(this.createError('VALIDATION_ERROR', 'Product detail retry count must be a non-negative number'));
      }

      if (typeof config.productsPerPage !== 'number' || config.productsPerPage <= 0) {
        return this.createFailure(this.createError('VALIDATION_ERROR', 'Products per page must be a positive number'));
      }

      if (typeof config.autoAddToLocalDB !== 'boolean') {
        return this.createFailure(this.createError('VALIDATION_ERROR', 'Auto add to local DB must be a boolean'));
      }

      // Validate optional fields
      if (config.headlessBrowser !== undefined && typeof config.headlessBrowser !== 'boolean') {
        return this.createFailure(this.createError('VALIDATION_ERROR', 'Headless browser must be a boolean'));
      }

      if (config.crawlerType !== undefined && !['playwright', 'axios'].includes(config.crawlerType)) {
        return this.createFailure(this.createError('VALIDATION_ERROR', 'Crawler type must be either "playwright" or "axios"'));
      }

      if (config.maxConcurrentTasks !== undefined && (typeof config.maxConcurrentTasks !== 'number' || config.maxConcurrentTasks <= 0)) {
        return this.createFailure(this.createError('VALIDATION_ERROR', 'Max concurrent tasks must be a positive number'));
      }

      if (config.requestDelay !== undefined && (typeof config.requestDelay !== 'number' || config.requestDelay < 0)) {
        return this.createFailure(this.createError('VALIDATION_ERROR', 'Request delay must be a non-negative number'));
      }

      if (config.batchSize !== undefined && (typeof config.batchSize !== 'number' || config.batchSize <= 0)) {
        return this.createFailure(this.createError('VALIDATION_ERROR', 'Batch size must be a positive number'));
      }

      if (config.batchDelayMs !== undefined && (typeof config.batchDelayMs !== 'number' || config.batchDelayMs < 0)) {
        return this.createFailure(this.createError('VALIDATION_ERROR', 'Batch delay must be a non-negative number'));
      }

      if (config.enableBatchProcessing !== undefined && typeof config.enableBatchProcessing !== 'boolean') {
        return this.createFailure(this.createError('VALIDATION_ERROR', 'Enable batch processing must be a boolean'));
      }

      if (config.batchRetryLimit !== undefined && (typeof config.batchRetryLimit !== 'number' || config.batchRetryLimit < 0)) {
        return this.createFailure(this.createError('VALIDATION_ERROR', 'Batch retry limit must be a non-negative number'));
      }

      return this.createSuccess(true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createFailure(this.createError('VALIDATION_ERROR', `Configuration validation failed: ${errorMessage}`));
    }
  }

  /**
   * Validate partial configuration update
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
  public getStatus(): ServiceResult<{
    isConfigLoaded: boolean;
    configKeys: string[];
    lastUpdated?: string;
  }> {
    try {
      return this.createSuccess({
        isConfigLoaded: this.isConfigLoaded(),
        configKeys: this.currentConfig ? Object.keys(this.currentConfig) : [],
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createFailure(
        this.createError('STATUS_ERROR', `Failed to get service status: ${errorMessage}`)
      );
    }
  }

  /**
   * Get default configuration
   */
  private async getDefaultConfig(): Promise<CrawlerConfig> {
    return {
      pageRangeLimit: 100,
      productListRetryCount: 3,
      productDetailRetryCount: 3,
      productsPerPage: 20,
      autoAddToLocalDB: true,
      headlessBrowser: true,
      crawlerType: 'axios',
      maxConcurrentTasks: 5,
      requestDelay: 1000,
      batchSize: 30,
      batchDelayMs: 2000,
      enableBatchProcessing: true,
      batchRetryLimit: 3
    };
  }
}
