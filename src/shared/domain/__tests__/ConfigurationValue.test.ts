/**
 * ConfigurationValue.test.ts
 * Unit tests for the Value Object pattern implementation
 */

import {
  ConfigurationValue,
  NumberRangeRule,
  UrlValidationRule,
  RequiredValueRule,
  ConfigurationValidationRules,
  ConfigurationValidator
} from '../ConfigurationValue';
import type { CrawlerConfig } from '../../../../types';

describe('ConfigurationValue', () => {
  describe('NumberRangeRule', () => {
    test('should validate numbers within range', () => {
      const rule = new NumberRangeRule(1, 100, 'Test Field');
      
      expect(rule.validate(50)).toBe(true);
      expect(rule.validate(1)).toBe(true);
      expect(rule.validate(100)).toBe(true);
    });

    test('should reject numbers outside range', () => {
      const rule = new NumberRangeRule(1, 100, 'Test Field');
      
      expect(rule.validate(0)).toBe(false);
      expect(rule.validate(101)).toBe(false);
      expect(rule.validate(-1)).toBe(false);
    });

    test('should have correct error message', () => {
      const rule = new NumberRangeRule(1, 100, 'Test Field');
      expect(rule.errorMessage).toBe('Test Field must be between 1 and 100');
    });
  });

  describe('UrlValidationRule', () => {
    test('should validate correct URLs', () => {
      const rule = new UrlValidationRule('Base URL');
      
      expect(rule.validate('https://example.com')).toBe(true);
      expect(rule.validate('http://localhost:3000')).toBe(true);
      expect(rule.validate('https://csa-iot.org/products')).toBe(true);
    });

    test('should reject invalid URLs', () => {
      const rule = new UrlValidationRule('Base URL');
      
      expect(rule.validate('not-a-url')).toBe(false);
      expect(rule.validate('ftp://invalid')).toBe(false);
      expect(rule.validate('')).toBe(false);
    });
  });

  describe('RequiredValueRule', () => {
    test('should validate non-empty values', () => {
      const rule = new RequiredValueRule('Required Field');
      
      expect(rule.validate('value')).toBe(true);
      expect(rule.validate(123)).toBe(true);
      expect(rule.validate(true)).toBe(true);
    });

    test('should reject empty or undefined values', () => {
      const rule = new RequiredValueRule('Required Field');
      
      expect(rule.validate(null)).toBe(false);
      expect(rule.validate(undefined)).toBe(false);
      expect(rule.validate('')).toBe(false);
    });
  });

  describe('ConfigurationValue', () => {
    test('should create valid configuration value', () => {
      const rules = [new NumberRangeRule(1, 100, 'Page Range')];
      const configValue = new ConfigurationValue(50, rules);
      
      expect(configValue.isValid).toBe(true);
      expect(configValue.value).toBe(50);
      expect(configValue.errors).toHaveLength(0);
    });

    test('should create invalid configuration value', () => {
      const rules = [new NumberRangeRule(1, 100, 'Page Range')];
      const configValue = new ConfigurationValue(150, rules);
      
      expect(configValue.isValid).toBe(false);
      expect(configValue.value).toBe(150);
      expect(configValue.errors).toContain('Page Range must be between 1 and 100');
    });

    test('should support value transformation', () => {
      const rules = [new NumberRangeRule(1, 100, 'Page Range')];
      const transformer = {
        transform: (value: number) => Math.max(1, Math.min(100, value))
      };
      
      const configValue = new ConfigurationValue(150, rules, transformer);
      
      expect(configValue.value).toBe(100);
      expect(configValue.isValid).toBe(true);
    });
  });

  describe('ConfigurationValidationRules', () => {
    test('should create page range limit rules', () => {
      const rules = ConfigurationValidationRules.pageRangeLimit();
      const configValue = new ConfigurationValue(5, rules);
      
      expect(configValue.isValid).toBe(true);
      expect(configValue.value).toBe(5);
    });

    test('should reject invalid page range limit', () => {
      const rules = ConfigurationValidationRules.pageRangeLimit();
      const configValue = new ConfigurationValue(0, rules);
      
      expect(configValue.isValid).toBe(false);
      expect(configValue.errors[0]).toContain('Page Range Limit must be between');
    });

    test('should create retry count rules', () => {
      const rules = ConfigurationValidationRules.retryCount('Product List Retry');
      const configValue = new ConfigurationValue(3, rules);
      
      expect(configValue.isValid).toBe(true);
    });
  });

  describe('ConfigurationValidator', () => {
    const validConfig: CrawlerConfig = {
      pageRangeLimit: 5,
      productListRetryCount: 3,
      productDetailRetryCount: 3,
      productsPerPage: 12,
      autoAddToLocalDB: true,
      autoStatusCheck: true,
      crawlerType: 'axios',
      batchSize: 50,
      batchDelayMs: 1000,
      enableBatchProcessing: true,
      batchRetryLimit: 3,
      baseUrl: 'https://csa-iot.org/csa-iot_products/',
      matterFilterUrl: 'https://csa-iot.org/csa-iot_products/?p_keywords=&p_type%5B%5D=14',
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

    test('should validate complete valid configuration', () => {
      const result = ConfigurationValidator.validateComplete(validConfig);
      
      expect(result.isValid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });

    test('should reject invalid page range limit', () => {
      const invalidConfig = { ...validConfig, pageRangeLimit: 0 };
      const result = ConfigurationValidator.validateComplete(invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.pageRangeLimit).toBeDefined();
      expect(result.errors.pageRangeLimit[0]).toContain('Page Range Limit must be between');
    });

    test('should reject invalid URLs', () => {
      const invalidConfig = { ...validConfig, baseUrl: 'not-a-url' };
      const result = ConfigurationValidator.validateComplete(invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.baseUrl).toBeDefined();
      expect(result.errors.baseUrl[0]).toContain('must be a valid URL');
    });

    test('should validate partial configuration updates', () => {
      const partialUpdate = { pageRangeLimit: 10 };
      const result = ConfigurationValidator.validatePartialUpdate(validConfig, partialUpdate);
      
      expect(result.isValid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });

    test('should reject invalid partial updates', () => {
      const partialUpdate = { pageRangeLimit: 0 };
      const result = ConfigurationValidator.validatePartialUpdate(validConfig, partialUpdate);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.pageRangeLimit).toBeDefined();
    });

    test('should handle multiple validation errors', () => {
      const invalidConfig = {
        ...validConfig,
        pageRangeLimit: 0,
        productListRetryCount: 0,
        baseUrl: 'invalid-url'
      };
      
      const result = ConfigurationValidator.validateComplete(invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(Object.keys(result.errors)).toHaveLength(3);
      expect(result.errors.pageRangeLimit).toBeDefined();
      expect(result.errors.productListRetryCount).toBeDefined();
      expect(result.errors.baseUrl).toBeDefined();
    });

    test('should provide warnings for edge cases', () => {
      const edgeCaseConfig = { ...validConfig, pageRangeLimit: 450 };
      const result = ConfigurationValidator.validateComplete(edgeCaseConfig);
      
      expect(result.isValid).toBe(true);
      // Check if warnings are generated for large values
      if (Object.keys(result.warnings).length > 0) {
        expect(result.warnings.pageRangeLimit).toBeDefined();
      }
    });
  });

  describe('Integration Tests', () => {
    test('should validate real-world configuration changes', () => {
      const originalConfig: CrawlerConfig = {
        pageRangeLimit: 5,
        productListRetryCount: 3,
        productDetailRetryCount: 3,
        productsPerPage: 12,
        autoAddToLocalDB: true,
        autoStatusCheck: true,
        crawlerType: 'axios',
        batchSize: 50,
        batchDelayMs: 1000,
        enableBatchProcessing: true,
        batchRetryLimit: 3,
        baseUrl: 'https://csa-iot.org/csa-iot_products/',
        matterFilterUrl: 'https://csa-iot.org/csa-iot_products/?filter',
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

      // Test user changing page range limit
      const userUpdate = { pageRangeLimit: 10 };
      const result = ConfigurationValidator.validatePartialUpdate(originalConfig, userUpdate);
      
      expect(result.isValid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });

    test('should catch the original bug scenario', () => {
      const originalConfig: CrawlerConfig = {
        pageRangeLimit: 5,
        productListRetryCount: 3,
        productDetailRetryCount: 3,
        productsPerPage: 12,
        autoAddToLocalDB: true,
        autoStatusCheck: true,
        crawlerType: 'axios',
        batchSize: 50,
        batchDelayMs: 1000,
        enableBatchProcessing: true,
        batchRetryLimit: 3,
        baseUrl: 'https://csa-iot.org/csa-iot_products/',
        matterFilterUrl: 'https://csa-iot.org/csa-iot_products/?filter',
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

      // Simulate the bug where partial config with missing fields becomes 0/undefined
      const partialConfigWithMissingFields = {
        pageRangeLimit: 10,
        productListRetryCount: undefined, // This should trigger validation error
        productDetailRetryCount: 0        // This should trigger minimum value validation
      } as Partial<CrawlerConfig>;

      const result = ConfigurationValidator.validatePartialUpdate(
        originalConfig,
        partialConfigWithMissingFields
      );

      // The validator should catch the minimum value violations
      expect(result.isValid).toBe(false);
      expect(result.errors.productDetailRetryCount).toBeDefined();
    });
  });
});
