/**
 * ConfigurationValue.ts
 * 
 * Configuration Value Object Pattern
 * 설정 값의 불변성, 유효성, 타입 안전성을 보장하는 도메인 객체
 */

import { CrawlerConfig } from '../../../types.js';

/**
 * 설정 값 검증 규칙 인터페이스
 */
export interface ValidationRule<T> {
  validate(value: T): boolean;
  errorMessage: string;
  warningMessage?: string;
}

/**
 * 설정 값 변환기 인터페이스
 */
export interface ValueTransformer<T> {
  transform(value: unknown): T;
  isValid(value: unknown): boolean;
}

/**
 * 숫자 범위 검증 규칙
 */
export class NumberRangeRule implements ValidationRule<number> {
  constructor(
    private min: number,
    private max: number,
    private fieldName: string
  ) {}

  validate(value: number): boolean {
    return typeof value === 'number' && 
           !isNaN(value) && 
           value >= this.min && 
           value <= this.max;
  }

  get errorMessage(): string {
    return `${this.fieldName} must be between ${this.min} and ${this.max}`;
  }

  get warningMessage(): string {
    if (this.max > 100) {
      return `Large ${this.fieldName} values may impact performance`;
    }
    return '';
  }
}

/**
 * URL 검증 규칙
 */
export class UrlValidationRule implements ValidationRule<string> {
  constructor(private fieldName: string) {}

  validate(value: string): boolean {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }

  get errorMessage(): string {
    return `${this.fieldName} must be a valid URL`;
  }
}

/**
 * 필수 값 검증 규칙
 */
export class RequiredValueRule implements ValidationRule<any> {
  constructor(private fieldName: string) {}

  validate(value: any): boolean {
    return value !== null && value !== undefined && value !== '';
  }

  get errorMessage(): string {
    return `${this.fieldName} is required`;
  }
}

/**
 * 설정 값 객체
 * 불변성과 유효성을 보장하는 도메인 객체
 */
export class ConfigurationValue<T> {
  private readonly _value: T;
  private readonly _isValid: boolean;
  private readonly _errors: readonly string[];
  private readonly _warnings: readonly string[];

  constructor(
    value: T,
    private readonly rules: ValidationRule<T>[],
    private readonly transformer?: ValueTransformer<T>
  ) {
    // 값 변환 시도
    const transformedValue = transformer ? transformer.transform(value) : value;
    this._value = transformedValue as T;

    // 유효성 검증
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const rule of rules) {
      if (!rule.validate(this._value)) {
        errors.push(rule.errorMessage);
      } else if (rule.warningMessage) {
        warnings.push(rule.warningMessage);
      }
    }

    this._errors = Object.freeze(errors);
    this._warnings = Object.freeze(warnings);
    this._isValid = errors.length === 0;
  }

  get value(): T {
    return this._value;
  }

  get isValid(): boolean {
    return this._isValid;
  }

  get errors(): readonly string[] {
    return this._errors;
  }

  get warnings(): readonly string[] {
    return this._warnings;
  }

  /**
   * 새로운 값으로 ConfigurationValue 생성
   */
  withValue(newValue: T): ConfigurationValue<T> {
    return new ConfigurationValue(newValue, this.rules, this.transformer);
  }

  /**
   * 값이 유효한 경우에만 실행되는 함수
   */
  ifValid<R>(fn: (value: T) => R): R | null {
    return this._isValid ? fn(this._value) : null;
  }

  /**
   * 기본값 제공 함수
   */
  orDefault(defaultValue: T): T {
    return this._isValid ? this._value : defaultValue;
  }
}

/**
 * 설정 필드별 검증 규칙 팩토리
 */
export class ConfigurationValidationRules {
  static pageRangeLimit(): ValidationRule<number>[] {
    return [
      new NumberRangeRule(1, 500, 'Page Range Limit')
    ];
  }

  static retryCount(fieldName: string): ValidationRule<number>[] {
    return [
      new NumberRangeRule(1, 20, fieldName)
    ];
  }

  static productsPerPage(): ValidationRule<number>[] {
    return [
      new NumberRangeRule(1, 100, 'Products Per Page')
    ];
  }

  static batchRetryLimit(): ValidationRule<number>[] {
    return [
      new NumberRangeRule(1, 10, 'Batch Retry Limit')
    ];
  }

  static url(fieldName: string): ValidationRule<string>[] {
    return [
      new RequiredValueRule(fieldName),
      new UrlValidationRule(fieldName)
    ];
  }

  static timeout(fieldName: string): ValidationRule<number>[] {
    return [
      new NumberRangeRule(1000, 300000, fieldName)
    ];
  }

  static concurrency(fieldName: string): ValidationRule<number>[] {
    return [
      new NumberRangeRule(1, 50, fieldName)
    ];
  }

  static delay(fieldName: string): ValidationRule<number>[] {
    return [
      new NumberRangeRule(0, 10000, fieldName)
    ];
  }
}

/**
 * 완전한 설정 검증기
 * 모든 설정 필드에 대한 통합 검증 제공
 */
export class ConfigurationValidator {
  /**
   * 부분 설정 업데이트 검증
   * 기존 설정과 새로운 부분 설정을 병합하여 검증
   */
  static validatePartialUpdate(
    _currentConfig: CrawlerConfig,
    partialUpdate: Partial<CrawlerConfig>
  ): { isValid: boolean; errors: Record<string, string[]>; warnings: Record<string, string[]> } {
    
    const errors: Record<string, string[]> = {};
    const warnings: Record<string, string[]> = {};

    // 부분 업데이트의 각 필드 검증
    for (const [key, value] of Object.entries(partialUpdate)) {
      if (value === undefined || value === null) continue;

      const fieldKey = key as keyof CrawlerConfig;
      let configValue: ConfigurationValue<any>;

      switch (fieldKey) {
        case 'pageRangeLimit':
          configValue = new ConfigurationValue(
            value,
            ConfigurationValidationRules.pageRangeLimit()
          );
          break;
        case 'productListRetryCount':
          configValue = new ConfigurationValue(
            value,
            ConfigurationValidationRules.retryCount('Product List Retry Count')
          );
          break;
        case 'productDetailRetryCount':
          configValue = new ConfigurationValue(
            value,
            ConfigurationValidationRules.retryCount('Product Detail Retry Count')
          );
          break;
        case 'productsPerPage':
          configValue = new ConfigurationValue(
            value,
            ConfigurationValidationRules.productsPerPage()
          );
          break;
        case 'batchRetryLimit':
          configValue = new ConfigurationValue(
            value,
            ConfigurationValidationRules.batchRetryLimit()
          );
          break;
        case 'baseUrl':
        case 'matterFilterUrl':
          configValue = new ConfigurationValue(
            value,
            ConfigurationValidationRules.url(fieldKey)
          );
          break;
        case 'pageTimeoutMs':
        case 'productDetailTimeoutMs':
          configValue = new ConfigurationValue(
            value,
            ConfigurationValidationRules.timeout(fieldKey)
          );
          break;
        case 'initialConcurrency':
        case 'detailConcurrency':
        case 'retryConcurrency':
        case 'maxConcurrentTasks':
          configValue = new ConfigurationValue(
            value,
            ConfigurationValidationRules.concurrency(fieldKey)
          );
          break;
        case 'minRequestDelayMs':
        case 'maxRequestDelayMs':
        case 'batchDelayMs':
        case 'requestDelay':
          configValue = new ConfigurationValue(
            value,
            ConfigurationValidationRules.delay(fieldKey)
          );
          break;
        default:
          // 검증 규칙이 없는 필드는 통과
          continue;
      }

      if (!configValue.isValid) {
        errors[key] = configValue.errors.slice();
      }
      if (configValue.warnings.length > 0) {
        warnings[key] = configValue.warnings.slice();
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      warnings
    };
  }

  /**
   * 전체 설정 검증
   */
  static validateComplete(config: CrawlerConfig): { 
    isValid: boolean; 
    errors: Record<string, string[]>; 
    warnings: Record<string, string[]> 
  } {
    return this.validatePartialUpdate({} as CrawlerConfig, config);
  }
}
