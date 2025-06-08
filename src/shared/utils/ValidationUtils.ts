/**
 * ValidationUtils.ts
 * Centralized validation utilities for page ranges, configurations, and data validation
 * 
 * Consolidates validation logic from:
 * - PageRangeParser
 * - CrawlingUtils
 * - ConfigUtils
 * - MissingPageCalculator
 * - page-validator
 */

import type { CrawlerConfig, Product } from '../../../types.js';

/**
 * Page range validation result interface
 */
export interface PageRangeValidationResult {
  isValid: boolean;
  message: string;
  adjustedStartPage?: number;
  adjustedEndPage?: number;
}

/**
 * Validation result interface
 */
export interface ValidationResult<T = any> {
  success: boolean;
  data?: T;
  errors: string[];
  warnings?: string[];
}

/**
 * Product validation result interface  
 */
export interface ProductValidationResult {
  valid: Product[];
  invalid: Product[];
  totalCount: number;
  validCount: number;
  invalidCount: number;
}

/**
 * Page completeness validation result
 */
export interface PageCompletenessResult {
  isComplete: boolean;
  expectedCount: number;
  actualCount: number;
  missingIndices?: number[];
  completionRate: number;
  reason?: string;
}

/**
 * Range validation options
 */
export interface RangeValidationOptions {
  allowZero?: boolean;
  allowNegative?: boolean;
  customErrorMessage?: string;
}

/**
 * Centralized validation utilities class
 */
export class ValidationUtils {
  
  // === Page Range Validation ===

  /**
   * Validate page range boundaries
   * 
   * @param startPage Start page number
   * @param endPage End page number  
   * @param totalPages Total available pages
   * @returns Validation result with suggestions
   */
  static validatePageRange(
    startPage: number,
    endPage: number,
    totalPages: number
  ): PageRangeValidationResult {
    // Basic boundary validation
    if (startPage < 1 || endPage < 1) {
      return {
        isValid: false,
        message: '페이지 번호는 1 이상이어야 합니다.',
        adjustedStartPage: Math.max(1, startPage),
        adjustedEndPage: Math.max(1, endPage)
      };
    }
    
    if (startPage > totalPages || endPage > totalPages) {
      return {
        isValid: false,
        message: `페이지 번호는 총 페이지 수(${totalPages})를 초과할 수 없습니다.`,
        adjustedStartPage: Math.min(startPage, totalPages),
        adjustedEndPage: Math.min(endPage, totalPages)
      };
    }
    
    // Descending order validation (for this specific crawler)
    if (startPage < endPage) {
      return {
        isValid: false,
        message: '시작 페이지는 끝 페이지보다 크거나 같아야 합니다.',
        adjustedStartPage: Math.max(startPage, endPage),
        adjustedEndPage: Math.min(startPage, endPage)
      };
    }
    
    return {
      isValid: true,
      message: '유효한 페이지 범위입니다.'
    };
  }

  /**
   * Validate individual page number
   * 
   * @param pageNumber Page number to validate
   * @param totalPages Total available pages
   * @param fieldName Field name for error messages
   * @returns Validation result
   */
  static validatePageNumber(
    pageNumber: number, 
    totalPages: number, 
    fieldName: string = 'Page number'
  ): ValidationResult<number> {
    const errors: string[] = [];

    if (!Number.isInteger(pageNumber)) {
      errors.push(`${fieldName} must be an integer`);
    }

    if (pageNumber < 1) {
      errors.push(`${fieldName} must be greater than 0`);
    }

    if (pageNumber > totalPages) {
      errors.push(`${fieldName} cannot exceed total pages (${totalPages})`);
    }

    return {
      success: errors.length === 0,
      data: errors.length === 0 ? pageNumber : undefined,
      errors
    };
  }

  // === Number Range Validation ===

  /**
   * Validate numeric value within specified range
   * 
   * @param value Value to validate
   * @param min Minimum allowed value
   * @param max Maximum allowed value
   * @param defaultValue Default value if invalid
   * @param options Validation options
   * @returns Validated and adjusted value
   */
  static validateNumberRange(
    value: any,
    min: number,
    max: number,
    defaultValue: number,
    options: RangeValidationOptions = {}
  ): number {
    const num = typeof value === 'number' ? value : parseFloat(value);
    
    if (isNaN(num)) return defaultValue;
    if (!options.allowNegative && num < 0) return defaultValue;
    if (!options.allowZero && num === 0) return defaultValue;
    
    return Math.max(min, Math.min(max, num));
  }

  /**
   * Validate numeric range with detailed result
   * 
   * @param value Value to validate
   * @param min Minimum value
   * @param max Maximum value
   * @param fieldName Field name for error messages
   * @returns Detailed validation result
   */
  static validateNumericRange(
    value: any,
    min: number,
    max: number,
    fieldName: string
  ): ValidationResult<number> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const num = typeof value === 'number' ? value : parseFloat(value);
    
    if (isNaN(num)) {
      errors.push(`${fieldName} must be a valid number`);
      return { success: false, errors, warnings };
    }

    if (num < min || num > max) {
      errors.push(`${fieldName} must be between ${min} and ${max}`);
    }

    // Performance warnings for large values
    if (num > 100 && fieldName.toLowerCase().includes('limit')) {
      warnings.push(`Large ${fieldName} values may impact performance`);
    }

    return {
      success: errors.length === 0,
      data: errors.length === 0 ? num : undefined,
      errors,
      warnings
    };
  }

  // === URL Validation ===

  /**
   * Validate and normalize URL
   * 
   * @param url URL to validate
   * @returns Validation result with normalized URL
   */
  static validateAndNormalizeUrl(url: string): { 
    isValid: boolean; 
    normalizedUrl?: string; 
    error?: string 
  } {
    if (!url || typeof url !== 'string') {
      return { isValid: false, error: 'URL is required and must be a string' };
    }

    try {
      // Add protocol if missing
      let normalizedUrl = url.trim();
      if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'https://' + normalizedUrl;
      }

      const urlObj = new URL(normalizedUrl);
      
      // Basic validation
      if (!urlObj.hostname) {
        return { isValid: false, error: 'Invalid hostname' };
      }

      // Check for common protocols
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return { isValid: false, error: 'Only HTTP and HTTPS protocols are supported' };
      }

      return { 
        isValid: true, 
        normalizedUrl: urlObj.toString() 
      };
    } catch (error) {
      return { 
        isValid: false, 
        error: `Invalid URL format: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  // === Configuration Validation ===

  /**
   * Validate crawler configuration
   * 
   * @param config Configuration to validate
   * @returns Validation result
   */
  static validateCrawlerConfig(config: CrawlerConfig): ValidationResult<CrawlerConfig> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Page range limit validation
    const pageRangeLimitResult = this.validateNumericRange(
      config.pageRangeLimit, 1, 500, 'Page Range Limit'
    );
    if (!pageRangeLimitResult.success) {
      errors.push(...pageRangeLimitResult.errors);
    }
    if (pageRangeLimitResult.warnings) {
      warnings.push(...pageRangeLimitResult.warnings);
    }

    // Products per page validation
    const productsPerPageResult = this.validateNumericRange(
      config.productsPerPage, 1, 100, 'Products Per Page'
    );
    if (!productsPerPageResult.success) {
      errors.push(...productsPerPageResult.errors);
    }

    // Retry count validations
    const retryFields = [
      { value: config.productDetailRetryCount, name: 'Product Detail Retry Count', max: 20 },
      { value: config.batchRetryLimit, name: 'Batch Retry Limit', max: 10 }
    ];

    for (const field of retryFields) {
      const result = this.validateNumericRange(field.value, 1, field.max, field.name);
      if (!result.success) {
        errors.push(...result.errors);
      }
    }

    // URL validations
    if (config.baseUrl) {
      const urlResult = this.validateAndNormalizeUrl(config.baseUrl);
      if (!urlResult.isValid) {
        errors.push(`Base URL: ${urlResult.error}`);
      }
    }

    return {
      success: errors.length === 0,
      data: errors.length === 0 ? config : undefined,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  // === Product Data Validation ===

  /**
   * Validate product data completeness
   * 
   * @param products Products to validate
   * @returns Validation result with valid/invalid products
   */
  static validateProductData(products: Product[]): ProductValidationResult {
    const valid: Product[] = [];
    const invalid: Product[] = [];
    
    products.forEach(product => {
      // Required field validation (URL is mandatory)
      const hasMandatoryFields = !!product.url;
      
      // Product identification validation (at least one identifier required)
      const hasIdentificationInfo = !!(
        product.manufacturer || 
        product.model || 
        product.certificateId
      );
      
      if (hasMandatoryFields && hasIdentificationInfo) {
        valid.push(product);
      } else {
        invalid.push(product);
      }
    });
    
    return {
      valid,
      invalid,
      totalCount: products.length,
      validCount: valid.length,
      invalidCount: invalid.length
    };
  }

  /**
   * Validate page data completeness
   * 
   * @param products Collected products from page
   * @param expectedCount Expected number of products
   * @param isLastPage Whether this is the last page
   * @param lastPageExpectedCount Expected count for last page (if known)
   * @returns Page completeness validation result
   */
  static validatePageCompleteness(
    products: Product[],
    expectedCount: number = 12,
    isLastPage: boolean = false,
    lastPageExpectedCount?: number
  ): PageCompletenessResult {
    const targetCount = isLastPage && lastPageExpectedCount === undefined ? 
      undefined : (isLastPage ? lastPageExpectedCount : expectedCount);
    
    const actualCount = products.length;
    
    // If no target count or actual meets/exceeds target, consider complete
    if (targetCount === undefined || actualCount >= targetCount) {
      return {
        isComplete: true,
        expectedCount: targetCount || actualCount,
        actualCount,
        completionRate: 100
      };
    }
    
    // Check for missing indices
    const presentIndices = new Set(
      products.map(p => p.indexInPage).filter(i => i !== undefined)
    );
    
    const missingIndices = Array.from(
      { length: targetCount },
      (_, i) => i
    ).filter(i => !presentIndices.has(i));
    
    const completionRate = (actualCount / targetCount) * 100;
    
    return {
      isComplete: false,
      expectedCount: targetCount,
      actualCount,
      missingIndices: missingIndices.length > 0 ? missingIndices : undefined,
      completionRate,
      reason: `수집된 ${actualCount}개 중 ${targetCount}개 필요${missingIndices.length > 0 ? `. 누락된 인덱스: ${missingIndices.join(', ')}` : ''}`
    };
  }

  // === Range Classification ===

  /**
   * Classify page ranges as continuous or non-continuous
   * 
   * @param pages Array of page numbers
   * @param minContinuousLength Minimum length to consider as continuous range
   * @returns Classification result
   */
  static classifyPageRanges(
    pages: number[], 
    minContinuousLength: number = 3
  ): {
    continuousRanges: { start: number; end: number; length: number }[];
    nonContinuousPages: number[];
  } {
    if (pages.length === 0) {
      return { continuousRanges: [], nonContinuousPages: [] };
    }

    const sortedPages = [...pages].sort((a, b) => b - a); // Descending order
    const continuousRanges: { start: number; end: number; length: number }[] = [];
    const nonContinuousPages: number[] = [];

    let currentRangeStart = sortedPages[0];
    let currentRangeEnd = sortedPages[0];

    for (let i = 1; i < sortedPages.length; i++) {
      const currentPage = sortedPages[i];
      const previousPage = sortedPages[i - 1];

      // Check if pages are consecutive (difference of 1 in descending order)
      if (previousPage - currentPage === 1) {
        currentRangeEnd = currentPage;
      } else {
        // End current range
        const rangeLength = currentRangeStart - currentRangeEnd + 1;
        
        if (rangeLength >= minContinuousLength) {
          continuousRanges.push({
            start: currentRangeStart,
            end: currentRangeEnd,
            length: rangeLength
          });
        } else {
          // Add individual pages to non-continuous
          for (let page = currentRangeStart; page >= currentRangeEnd; page--) {
            nonContinuousPages.push(page);
          }
        }

        // Start new range
        currentRangeStart = currentPage;
        currentRangeEnd = currentPage;
      }
    }

    // Handle last range
    const lastRangeLength = currentRangeStart - currentRangeEnd + 1;
    if (lastRangeLength >= minContinuousLength) {
      continuousRanges.push({
        start: currentRangeStart,
        end: currentRangeEnd,
        length: lastRangeLength
      });
    } else {
      for (let page = currentRangeStart; page >= currentRangeEnd; page--) {
        nonContinuousPages.push(page);
      }
    }

    return { continuousRanges, nonContinuousPages };
  }

  // === Input Sanitization ===

  /**
   * Sanitize and normalize string input
   * 
   * @param input Input string to sanitize
   * @returns Sanitized string
   */
  static sanitizeStringInput(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    return input
      .trim()
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/[^\w\s\-~:,]/g, '') // Remove special characters except allowed ones
      .substring(0, 1000); // Limit length
  }

  /**
   * Validate page range string format
   * 
   * @param input Page range string (e.g., "1~12, 34, 72")
   * @returns Validation result
   */
  static validatePageRangeString(input: string): ValidationResult<string> {
    const errors: string[] = [];

    if (!input || typeof input !== 'string') {
      errors.push('페이지 범위 문자열이 필요합니다.');
      return { success: false, errors };
    }

    const sanitized = this.sanitizeStringInput(input);
    if (!sanitized) {
      errors.push('유효한 페이지 범위가 없습니다.');
      return { success: false, errors };
    }

    // Basic format validation
    const validPattern = /^[\d\s,~\-:]+$/;
    if (!validPattern.test(sanitized)) {
      errors.push('페이지 범위는 숫자, 쉼표, 범위 구분자(~, -, :)만 포함할 수 있습니다.');
    }

    return {
      success: errors.length === 0,
      data: errors.length === 0 ? sanitized : undefined,
      errors
    };
  }

  // === Utility Methods ===

  /**
   * Check if value is valid positive integer
   * 
   * @param value Value to check
   * @returns Boolean indicating validity
   */
  static isValidPositiveInteger(value: any): boolean {
    return Number.isInteger(value) && value > 0;
  }

  /**
   * Check if value is valid non-negative integer
   * 
   * @param value Value to check
   * @returns Boolean indicating validity
   */
  static isValidNonNegativeInteger(value: any): boolean {
    return Number.isInteger(value) && value >= 0;
  }

  /**
   * Validate array of page numbers
   * 
   * @param pages Array of page numbers
   * @param totalPages Total available pages
   * @returns Validation result
   */
  static validatePageArray(pages: number[], totalPages: number): ValidationResult<number[]> {
    const errors: string[] = [];
    const validPages: number[] = [];

    for (const page of pages) {
      if (!this.isValidPositiveInteger(page)) {
        errors.push(`Invalid page number: ${page}`);
        continue;
      }

      if (page > totalPages) {
        errors.push(`Page ${page} exceeds total pages (${totalPages})`);
        continue;
      }

      validPages.push(page);
    }

    return {
      success: errors.length === 0,
      data: validPages,
      errors
    };
  }
}
