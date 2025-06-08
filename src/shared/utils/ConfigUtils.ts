/**
 * Config Utilities
 * 
 * Centralized configuration management utilities to eliminate code duplication
 * across ConfigManager, ConfigurationService, SessionConfigManager, and ConfigurationViewModel.
 * 
 * Features:
 * - Unified default configuration source
 * - Common validation patterns
 * - Standardized error handling
 * - Configuration merging logic
 */

import type { CrawlerConfig, MutableCrawlerConfig } from '../../../types.js';
import { ConfigurationValidator } from '../domain/ConfigurationValue.js';

/**
 * Default configuration values - single source of truth
 */
export const DEFAULT_CONFIG: MutableCrawlerConfig = {
  // Core crawler settings
  pageRangeLimit: 10,
  productListRetryCount: 9,
  productDetailRetryCount: 9,
  productsPerPage: 12,
  autoAddToLocalDB: true,
  autoStatusCheck: true,
  crawlerType: 'axios',
  
  // Batch processing
  batchSize: 30,
  batchDelayMs: 2000,
  enableBatchProcessing: true,
  batchRetryLimit: 3,

  // URLs and timeouts
  baseUrl: 'https://csa-iot.org/csa-iot_products/',
  matterFilterUrl: 'https://csa-iot.org/csa-iot_products/?p_keywords=&p_type%5B%5D=14&p_program_type%5B%5D=1049&p_certificate=&p_family=&p_firmware_ver=',
  pageTimeoutMs: 90000,
  productDetailTimeoutMs: 90000,
  
  // Concurrency and performance
  initialConcurrency: 16,
  detailConcurrency: 16,
  retryConcurrency: 9,
  minRequestDelayMs: 100,
  maxRequestDelayMs: 2200,
  retryStart: 2,
  retryMax: 10,
  cacheTtlMs: 300000,
  
  // Browser settings
  headlessBrowser: true,
  maxConcurrentTasks: 16,
  requestDelay: 100,
  customUserAgent: undefined,
  lastExcelExportPath: undefined,
  
  // Logging configuration
  logging: {
    level: 'INFO' as const,
    components: {},
    enableStackTrace: false,
    enableTimestamp: true
  }
};

/**
 * Configuration operation result interface
 */
export interface ConfigOperationResult<T = CrawlerConfig> {
  success: boolean;
  data?: T;
  error?: string;
  warnings?: string[];
}

/**
 * Configuration utilities class
 */
export class ConfigUtils {
  /**
   * Get default configuration as immutable copy
   */
  static getDefaultConfig(): CrawlerConfig {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  /**
   * Safely merge configuration updates with existing config
   * 
   * @param currentConfig - Current configuration
   * @param updates - Partial updates to apply
   * @returns Merged configuration with validation
   */
  static mergeConfig(
    currentConfig: CrawlerConfig,
    updates: Partial<CrawlerConfig>
  ): ConfigOperationResult<CrawlerConfig> {
    try {
      // 1. Pre-validate partial update
      const validationResult = ConfigurationValidator.validatePartialUpdate(
        currentConfig,
        updates
      );

      if (!validationResult.isValid) {
        const errorDetails = Object.entries(validationResult.errors)
          .map(([field, errors]) => `${field}: ${(errors as string[]).join(', ')}`)
          .join('; ');
        
        return {
          success: false,
          error: `Configuration validation failed: ${errorDetails}`
        };
      }

      // 2. Extract validated fields only
      const validatedUpdates: Record<string, any> = {};
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined && value !== null) {
          validatedUpdates[key] = value;
        }
      }

      // 3. Merge configurations
      const mergedConfig: CrawlerConfig = {
        ...currentConfig,
        ...validatedUpdates
      } as CrawlerConfig;

      // 4. Final validation
      const finalValidation = ConfigurationValidator.validateComplete(mergedConfig);
      if (!finalValidation.isValid) {
        const errorDetails = Object.entries(finalValidation.errors)
          .map(([field, errors]) => `${field}: ${(errors as string[]).join(', ')}`)
          .join('; ');
        
        return {
          success: false,
          error: `Final configuration validation failed: ${errorDetails}`
        };
      }

      // 5. Collect warnings
      const warnings: string[] = [];
      if (Object.keys(validationResult.warnings).length > 0) {
        const warningDetails = Object.entries(validationResult.warnings)
          .map(([field, warnings]) => `${field}: ${(warnings as string[]).join(', ')}`)
          .join('; ');
        warnings.push(warningDetails);
      }

      return {
        success: true,
        data: mergedConfig,
        warnings: warnings.length > 0 ? warnings : undefined
      };

    } catch (error) {
      return {
        success: false,
        error: `Configuration merge failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Validate configuration with standardized result format
   * 
   * @param config - Configuration to validate
   * @returns Validation result with success flag and details
   */
  static validateConfig(config: CrawlerConfig): ConfigOperationResult<CrawlerConfig> {
    try {
      const validationResult = ConfigurationValidator.validateComplete(config);
      
      if (!validationResult.isValid) {
        const errorDetails = Object.entries(validationResult.errors)
          .map(([field, errors]) => `${field}: ${(errors as string[]).join(', ')}`)
          .join('; ');
        
        return {
          success: false,
          error: `Configuration validation failed: ${errorDetails}`
        };
      }

      const warnings: string[] = [];
      if (Object.keys(validationResult.warnings).length > 0) {
        const warningDetails = Object.entries(validationResult.warnings)
          .map(([field, warnings]) => `${field}: ${(warnings as string[]).join(', ')}`)
          .join('; ');
        warnings.push(warningDetails);
      }

      return {
        success: true,
        data: config,
        warnings: warnings.length > 0 ? warnings : undefined
      };

    } catch (error) {
      return {
        success: false,
        error: `Configuration validation failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Create a safe immutable copy of configuration
   * 
   * @param config - Configuration to copy
   * @returns Deep cloned configuration
   */
  static cloneConfig(config: CrawlerConfig): CrawlerConfig {
    return JSON.parse(JSON.stringify(config));
  }

  /**
   * Check if configuration has specific field
   * 
   * @param config - Configuration to check
   * @param field - Field name to check
   * @returns True if field exists and is not undefined/null
   */
  static hasConfigField<K extends keyof CrawlerConfig>(
    config: CrawlerConfig,
    field: K
  ): boolean {
    return config[field] !== undefined && config[field] !== null;
  }

  /**
   * Get configuration field with fallback to default
   * 
   * @param config - Configuration to read from
   * @param field - Field name to get
   * @param defaultValue - Optional default value
   * @returns Field value or default
   */
  static getConfigField<K extends keyof CrawlerConfig>(
    config: CrawlerConfig,
    field: K,
    defaultValue?: CrawlerConfig[K]
  ): CrawlerConfig[K] | undefined {
    const value = config[field];
    return value !== undefined ? value : (defaultValue ?? DEFAULT_CONFIG[field]);
  }

  /**
   * Create configuration diff for debugging
   * 
   * @param oldConfig - Previous configuration
   * @param newConfig - New configuration
   * @returns Object with changed fields
   */
  static createConfigDiff(
    oldConfig: CrawlerConfig,
    newConfig: CrawlerConfig
  ): Record<string, { from: any; to: any }> {
    const diff: Record<string, { from: any; to: any }> = {};
    
    const allKeys = new Set([
      ...Object.keys(oldConfig),
      ...Object.keys(newConfig)
    ]);

    for (const key of allKeys) {
      const oldValue = (oldConfig as any)[key];
      const newValue = (newConfig as any)[key];
      
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        diff[key] = { from: oldValue, to: newValue };
      }
    }

    return diff;
  }

  /**
   * Format configuration errors for user display
   * 
   * @param errors - Validation errors from ConfigurationValidator
   * @returns User-friendly error messages
   */
  static formatValidationErrors(
    errors: Record<string, string[]>
  ): string[] {
    return Object.entries(errors)
      .map(([field, fieldErrors]) => {
        const fieldName = field.replace(/([A-Z])/g, ' $1').toLowerCase();
        return `${fieldName}: ${fieldErrors.join(', ')}`;
      });
  }

  /**
   * Check if configuration is at default values
   * 
   * @param config - Configuration to check
   * @returns True if all values match defaults
   */
  static isDefaultConfig(config: CrawlerConfig): boolean {
    const defaultConfig = ConfigUtils.getDefaultConfig();
    return JSON.stringify(config) === JSON.stringify(defaultConfig);
  }

  /**
   * Extract only changed fields from configuration
   * 
   * @param config - Current configuration
   * @param baseConfig - Base configuration to compare against (defaults to DEFAULT_CONFIG)
   * @returns Object with only changed fields
   */
  static extractChangedFields(
    config: CrawlerConfig,
    baseConfig: CrawlerConfig = ConfigUtils.getDefaultConfig()
  ): Partial<CrawlerConfig> {
    const changes: Partial<CrawlerConfig> = {};
    
    for (const [key, value] of Object.entries(config)) {
      const baseValue = (baseConfig as any)[key];
      if (JSON.stringify(value) !== JSON.stringify(baseValue)) {
        (changes as any)[key] = value;
      }
    }

    return changes;
  }
}
